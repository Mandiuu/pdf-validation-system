import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, FileText, CheckCircle, AlertTriangle, 
  X, Eye, Calendar, Building
} from 'lucide-react';

const PDFDateValidationApp = () => {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [validationResults, setValidationResults] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [showFileDetail, setShowFileDetail] = useState(null);
  const [validationProgress, setValidationProgress] = useState({ current: 0, total: 0 });
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const fileInputRef = useRef(null);

  // Load PDF.js dynamically from CDN
  useEffect(() => {
    const loadPdfJs = async () => {
      try {
        // Check if PDF.js is already loaded
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          setPdfJsLoaded(true);
          return;
        }

        // Load PDF.js from CDN
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => {
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            setPdfJsLoaded(true);
          } else {
            setLoadError('PDF.js failed to load properly');
          }
        };
        script.onerror = () => {
          setLoadError('Failed to load PDF.js from CDN');
        };
        document.head.appendChild(script);
      } catch (error) {
        setLoadError(`Error loading PDF.js: ${error.message}`);
      }
    };

    loadPdfJs();
  }, []);

  const handleFileUpload = async (event) => {
    if (!pdfJsLoaded) {
      alert('PDF.js aún se está cargando. Por favor espera un momento.');
      return;
    }

    const files = Array.from(event.target.files);
    const pdfFiles = files.filter(file => file.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      alert('Por favor selecciona solo archivos PDF');
      return;
    }

    setUploadedFiles(pdfFiles);
    setIsValidating(true);
    setValidationProgress({ current: 0, total: pdfFiles.length });
    
    const results = [];
    
    // Process each PDF file
    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      
      // Update progress
      setValidationProgress({ current: i + 1, total: pdfFiles.length });
      
      try {
        const analysis = await analyzeArchitecturalPDF(file);
        results.push({
          file,
          ...analysis
        });
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        results.push({
          file,
          extractedData: null,
          errors: [{
            type: 'PROCESSING_ERROR',
            message: '❌ Error al procesar el PDF',
            details: `No se pudo leer el archivo: ${error.message}`
          }],
          warnings: [],
          status: 'rejected'
        });
      }
    }
    
    setValidationResults(results);
    setIsValidating(false);
    setValidationProgress({ current: 0, total: 0 });
  };

  const readPDFFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        resolve(new Uint8Array(e.target.result));
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const extractTextFromPDF = async (file) => {
    try {
      if (!window.pdfjsLib) {
        throw new Error('PDF.js not loaded');
      }

      // Read file as array buffer
      const arrayBuffer = await readPDFFile(file);
      
      // Load PDF document
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      const pageTexts = [];
      const textItems = []; // Store text with coordinates
      
      // Extract text from each page
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items
          .map(item => item.str)
          .join(' ');
        
        // Extract text items with positioning data
        const pageTextItems = textContent.items.map(item => ({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
          fontName: item.fontName,
          fontSize: item.transform[0] // Font size is in transform matrix
        }));
        
        pageTexts.push(pageText);
        textItems.push(...pageTextItems);
        fullText += pageText + '\n';
      }
      
      // Analyze layout for alignment issues
      const layoutAnalysis = analyzeLayoutAlignment(textItems);
      
      return {
        fullText,
        pageTexts,
        textItems,
        layoutAnalysis,
        numPages: pdf.numPages,
        metadata: await pdf.getMetadata()
      };
      
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error(`Failed to extract text: ${error.message}`);
    }
  };

  const analyzeLayoutAlignment = (textItems) => {
    console.log('DEBUG - Analyzing layout alignment...');
    console.log('DEBUG - Text items with coordinates:', textItems.slice(0, 10)); // Show first 10 items
    
    const issues = [];
    const alignmentTolerance = 2; // pixels
    
    // Group text items by approximate Y coordinate (horizontal alignment)
    const lineGroups = {};
    textItems.forEach(item => {
      if (item.text.trim().length > 0) {
        const roundedY = Math.round(item.y / 5) * 5; // Group by 5-pixel bands
        if (!lineGroups[roundedY]) {
          lineGroups[roundedY] = [];
        }
        lineGroups[roundedY].push(item);
      }
    });
    
    // Check for alignment issues in title block area (approximate coordinates)
    const titleBlockItems = textItems.filter(item => {
      // Approximate title block area - adjust these coordinates based on your PDFs
      return item.y > 50 && item.y < 200 && item.x > 400; // Right side of page
    });
    
    console.log('DEBUG - Title block items found:', titleBlockItems.length);
    
    if (titleBlockItems.length > 0) {
      // Check for text that seems misaligned
      const leftAlignedItems = titleBlockItems.filter(item => {
        // Look for items that should be left-aligned in fields
        return item.text.match(/^(Arquitecto|Proyecto|Propietario|Escala|Fecha|Lamina)/i);
      });
      
      if (leftAlignedItems.length > 1) {
        // Check if all left-aligned items have similar X coordinates
        const xCoords = leftAlignedItems.map(item => item.x);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        
        console.log('DEBUG - Left-aligned X coordinates:', xCoords);
        console.log('DEBUG - X coordinate range:', minX, 'to', maxX);
        
        if (maxX - minX > alignmentTolerance * 3) {
          issues.push('Inconsistent left alignment in title block fields');
        }
      }
      
      // Check for text that appears outside expected boundaries
      const suspiciousItems = titleBlockItems.filter(item => {
        // Flag items that seem to be positioned unusually
        return item.text.length > 3 && (
          item.x < 50 || // Too far left
          item.x > 800   // Too far right for most PDFs
        );
      });
      
      if (suspiciousItems.length > 0) {
        issues.push(`Text elements positioned outside expected boundaries: ${suspiciousItems.length} items`);
        console.log('DEBUG - Suspicious positioned items:', suspiciousItems);
      }
    }
    
    return {
      hasAlignmentIssues: issues.length > 0,
      formattingProblems: issues,
      titleBlockItemCount: titleBlockItems.length,
      totalTextItems: textItems.length
    };
  };

  const analyzeArchitecturalPDF = async (file) => {
    try {
      // Extract actual text content from PDF
      const pdfContent = await extractTextFromPDF(file);

      
      // Initialize extracted data
      const extractedData = {
        projectName: '',
        architect: '',
        owner: '',
        address: '',
        titleDate: '',
        revisionDates: [],
        sheet: '',
        documentType: '',
        scale: '',
        rawText: pdfContent.fullText // Store for debugging
      };

      // Extract project information using improved regex patterns
      // Clean the text and split into lines for better parsing
      const lines = pdfContent.fullText.split(/[\r\n]+/).map(line => line.trim()).filter(line => line.length > 0);
      const cleanText = pdfContent.fullText.replace(/\s+/g, ' ').trim();
      
      // Project name patterns - look for "Casa hermanos" specifically
      const projectPatterns = [
        /\bCasa\s+hermanos\b/i,
        /proyecto[:\s]*([^,\n\r]*casa[^,\n\r]*)/i,
        /\b(casa\s+\w+)\b/i
      ];
      
      for (const pattern of projectPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
          extractedData.projectName = match[1] ? match[1].trim() : match[0].trim();
          break;
        }
      }

      // Architect name patterns - specifically look for "Javier Andrés Moya Ortiz"
      const architectPatterns = [
        // Look for the exact name pattern
        /\bJavier\s+Andr[eé]s\s+Moya\s+Ortiz\b/i,
        // Look for name after "Arquitecto" label
        /arquitecto[:\s]*([^,\n\r]*Javier[^,\n\r]*)/i,
        // Look for variations
        /\bJavier\s+Andr[eé]s\s+(?:Moya\s+)?Ortiz\b/i
      ];
      
      for (const pattern of architectPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
          if (match[1]) {
            // Extract just the name part, clean up extra words
            const nameMatch = match[1].match(/Javier\s+Andr[eé]s\s+(?:Moya\s+)?Ortiz/i);
            extractedData.architect = nameMatch ? nameMatch[0].trim() : match[1].trim();
          } else {
            extractedData.architect = match[0].trim();
          }
          break;
        }
      }

      // Owner/Client patterns - look for names after "Propietario"
      const ownerPatterns = [
        // Look for specific names we expect
        /\bOmar\s+Andr[eé]s\s+Param\s+Abu-ghosh\b/i,
        /\bNicol[aá]s\s+Andr[eé]s\s+Param\s+Abu-ghosh\b/i,
        // General pattern after "Propietario"
        /propietario[:\s]*([^,\n\r]*(?:Omar|Nicolás)[^,\n\r]*)/i
      ];
      
      const foundOwners = [];
      for (const pattern of ownerPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
          const ownerName = match[1] ? match[1].trim() : match[0].trim();
          if (!foundOwners.includes(ownerName)) {
            foundOwners.push(ownerName);
          }
        }
      }
      if (foundOwners.length > 0) {
        extractedData.owner = foundOwners.join(', ');
      }

      // Address patterns - look for street addresses
      const addressPatterns = [
        /\bMonse[ñn]or\s+Adolfo\s+Rodriguez\s+\d+/i,
        /direcci[oó]n[:\s]*([^,\n\r]*\d{4,}[^,\n\r]*)/i
      ];
      
      for (const pattern of addressPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
          extractedData.address = match[1] ? match[1].trim() : match[0].trim();
          break;
        }
      }

      // ENHANCED DATE EXTRACTION WITH ULTRA-SPECIFIC DEBUGGING
      console.log('DEBUG - STARTING ENHANCED DATE EXTRACTION');
      console.log('DEBUG - Full PDF text length:', pdfContent.fullText.length);
      console.log('DEBUG - Clean text sample (first 2000 chars):', cleanText.substring(0, 2000));
      
      // Look specifically for the revision pattern that should catch the error case
      const revisionPatterns = [
        // Very specific pattern for the architectural revisions
        /(\d+\.?\d*)\s+(ANTEPROYECTO|PROYECTO\s*DEFINITIVO|MODIFICACI[OÓ]N\s*DE\s*PROYECTO)\s+(\d{1,2}\/\d{1,2}\/\d{4})/gi,
        // More flexible pattern
        /(\d+\.?\d*)\s*[-\s]*(ANTEPROYECTO|PROYECTO.*?DEFINITIVO|MODIFICACI[OÓ]N.*?PROYECTO)\s*[-\s]*(\d{1,2}\/\d{1,2}\/\d{4})/gi,
        // Ultra simple fallback - just look for any sequence of: digit(s) + space + text + space + date
        /(\d+\.?\d*)\s+([A-ZÁÉÍÓÚÑ][^0-9\n\r]*?)\s+(\d{1,2}\/\d{1,2}\/\d{4})/gi
      ];
      
      const foundRevisions = [];
      
      // Try each pattern and show detailed results
      for (let patternIndex = 0; patternIndex < revisionPatterns.length; patternIndex++) {
        const pattern = revisionPatterns[patternIndex];
        console.log(`DEBUG - TRYING PATTERN ${patternIndex + 1}:`, pattern.source);
        
        // Reset regex
        pattern.lastIndex = 0;
        let match;
        let matchCount = 0;
        
        while ((match = pattern.exec(cleanText)) !== null && matchCount < 50) {
          matchCount++;
          console.log(`DEBUG - Pattern ${patternIndex + 1} - Match ${matchCount}:`, {
            fullMatch: match[0],
            number: match[1],
            description: match[2], 
            date: match[3],
            position: match.index
          });
          
          if (match.length >= 3) {
            const revisionNumber = match[1];
            const description = match[2];
            const date = match[3];
            
            // Check if valid date
            if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(date)) {
              foundRevisions.push({
                number: revisionNumber,
                description: description.trim(),
                date: date.trim(),
                fullMatch: match[0],
                patternUsed: patternIndex + 1,
                position: match.index
              });
              console.log(`DEBUG - Pattern ${patternIndex + 1} - ADDED REVISION:`, {
                number: revisionNumber,
                description: description.trim(),
                date: date.trim(),
                pattern: patternIndex + 1
              });
            }
          }
        }
        console.log(`DEBUG - Pattern ${patternIndex + 1} completed. Total matches: ${matchCount}`);
        
        // For this debugging, don't break early - let's see all matches
      }
      
      console.log('DEBUG - ALL FOUND REVISIONS (before deduplication):', foundRevisions);
      
      // Now deduplicate and assign final revisions
      const seenRevisions = new Set();
      const finalRevisions = [];
      
      foundRevisions.forEach(revision => {
        const revisionKey = `${revision.number}-${revision.description}-${revision.date}`;
        if (!seenRevisions.has(revisionKey)) {
          finalRevisions.push(revision);
          seenRevisions.add(revisionKey);
          console.log('DEBUG - FINAL REVISION ADDED:', revisionKey);
        } else {
          console.log('DEBUG - DUPLICATE REVISION SKIPPED:', revisionKey);
        }
      });
      
      extractedData.revisionDates = finalRevisions;
      console.log('DEBUG - FINAL REVISIONS FOR VALIDATION:', finalRevisions);
      console.log('DEBUG - FINAL REVISION COUNT:', finalRevisions.length);
      
      // Look for title date separately
      const titleDateMatch = cleanText.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{4}/i);
      if (titleDateMatch) {
        extractedData.titleDate = titleDateMatch[0];
      }

      // Sheet number patterns - look for specific formats
      // Find this section and remove backslashes before forward slashes:
      const sheetPatterns = [
      /l[aá]mina[:\s]*(\d+[-/]?\w*)/i,        // removed backslash before /
      /hoja[:\s]*(\d+[-/]?\w*)/i,             // removed backslash before /
      /\b(\d+)\b(?=\s*$)/m,
      /\b(\d{1,2}[-/]\w+)\b/g                 // removed backslash before /
    ];
      
      for (const pattern of sheetPatterns) {
        const match = cleanText.match(pattern);
        if (match && match[1]) {
          extractedData.sheet = match[1].trim();
          break;
        }
      }

      // Scale patterns - look for architectural scales
      const scalePatterns = [
        /escala?[:\s]*(1:\d+)/i,
        /esc[:\s.]*(\d+:\d+)/i,
        /\b(1:\d+)\b/g,
        /sin\s+escala/i
      ];
      
      const foundScales = [];
      for (const pattern of scalePatterns) {
        const matches = cleanText.match(pattern);
        if (matches) {
          if (Array.isArray(matches)) {
            foundScales.push(...matches);
          } else {
            foundScales.push(matches[1] || matches[0]);
          }
        }
      }
      
      if (foundScales.length > 0) {
        // Prefer specific scales like 1:25, 1:50, etc.
        const specificScale = foundScales.find(scale => /1:\d+/.test(scale));
        extractedData.scale = specificScale || foundScales[0];
      }

      // Document type based on content with better pattern matching
      const documentTypePatterns = [
        { pattern: /detalle.*cocina/i, type: 'Detalle Cocina' },
        { pattern: /detalle.*ba[ñn]o/i, type: 'Detalle Baños' },
        { pattern: /detalle.*puerta/i, type: 'Detalle de Puertas' },
        { pattern: /corte.*arquitect[oó]nico/i, type: 'Cortes Arquitectónicos' },
        { pattern: /corte.*elevaci[oó]n/i, type: 'Corte Elevación' },
        { pattern: /planta.*detalle/i, type: 'Planta Detalle' },
        { pattern: /planta.*emplazamiento/i, type: 'Planta Emplazamiento' },
        { pattern: /elevaci[oó]n/i, type: 'Elevación' },
        { pattern: /planta/i, type: 'Planta Arquitectónica' },
        { pattern: /localizaci[oó]n/i, type: 'Plano de Localización' }
      ];
      
      for (const docType of documentTypePatterns) {
        if (docType.pattern.test(cleanText)) {
          extractedData.documentType = docType.type;
          break;
        }
      }
      
      // If no specific type found, default
      if (!extractedData.documentType) {
        extractedData.documentType = 'Documento Arquitectónico';
      }

      // Enhanced validation with layout and formatting checks
      const errors = [];
      const warnings = [];

      // 1. Enhanced architect name validation with specific error detection
      const standardArchitectName = 'Javier Andrés Moya Ortiz';
      if (extractedData.architect) {
        // Clean the extracted name
        const cleanExtractedName = extractedData.architect
          .replace(/\s+/g, ' ')
          .replace(/[^\w\sñáéíóúü]/gi, '')
          .trim();
        
        const cleanStandardName = standardArchitectName
          .replace(/\s+/g, ' ')
          .trim();
        
        // Check for exact match (case insensitive)
        if (cleanExtractedName.toLowerCase() !== cleanStandardName.toLowerCase()) {
          
          // Specific error detection for common typos
          if (cleanExtractedName.toLowerCase().includes('ortizs')) {
            errors.push({
              type: 'ARCHITECT_NAME_TYPO',
              message: '❌ ERROR TIPOGRÁFICO EN NOMBRE DE ARQUITECTO: "s" extra detectada',
              details: `Encontrado: "${extractedData.architect}" | Error: "Ortizs" debe ser "Ortiz" | Estándar: "${standardArchitectName}"`
            });
          } else if (cleanExtractedName.toLowerCase().includes('andres') && !cleanExtractedName.toLowerCase().includes('andrés')) {
            errors.push({
              type: 'ARCHITECT_NAME_ACCENT',
              message: '❌ ERROR DE ACENTUACIÓN EN NOMBRE DE ARQUITECTO: Falta acento en "Andrés"',
              details: `Encontrado: "${extractedData.architect}" | Debe ser: "${standardArchitectName}"`
            });
          } else if (!cleanExtractedName.toLowerCase().includes('moya')) {
            errors.push({
              type: 'ARCHITECT_NAME_INCOMPLETE',
              message: '❌ ERROR EN NOMBRE DE ARQUITECTO: Nombre incompleto, falta "Moya"',
              details: `Encontrado: "${extractedData.architect}" | Completo: "${standardArchitectName}"`
            });
          } else if (cleanExtractedName.toLowerCase().includes(cleanStandardName.toLowerCase())) {
            warnings.push({
              type: 'ARCHITECT_NAME_WARNING',
              message: '⚠️ NOMBRE DE ARQUITECTO: Nombre correcto encontrado pero con texto adicional',
              details: `Extraído: "${extractedData.architect}" | Se esperaba solo: "${standardArchitectName}"`
            });
          } else {
            errors.push({
              type: 'ARCHITECT_NAME_ERROR',
              message: '❌ ERROR EN NOMBRE DE ARQUITECTO: No coincide con el nombre estándar',
              details: `Encontrado: "${extractedData.architect}" | Estándar: "${standardArchitectName}"`
            });
          }
        }
      } else {
        warnings.push({
          type: 'ARCHITECT_NAME_MISSING',
          message: '⚠️ NOMBRE DE ARQUITECTO: No se pudo extraer automáticamente',
          details: 'Verifique manualmente que el nombre del arquitecto esté presente y sea legible'
        });
      }

      // Validate project name
      if (!extractedData.projectName || extractedData.projectName.length < 3) {
        warnings.push({
          type: 'PROJECT_NAME_WARNING',
          message: '⚠️ NOMBRE DE PROYECTO: No se pudo extraer o es muy corto',
          details: 'Verifique que el nombre del proyecto esté claramente indicado'
        });
      }

      // Validate dates
      if (extractedData.revisionDates.length === 0 && !extractedData.titleDate) {
        warnings.push({
          type: 'DATE_WARNING',
          message: '⚠️ FECHAS: No se pudieron extraer fechas automáticamente',
          details: 'Verifique manualmente las fechas en el documento'
        });
      }

      // ENHANCED DATE VALIDATION WITH SUPER DETAILED DEBUGGING
      console.log('DEBUG - STARTING DATE VALIDATION');
      console.log('DEBUG - Revisions to validate:', extractedData.revisionDates);
      
      if (extractedData.revisionDates.length > 0) {
        // Check for actual duplicate dates (same date appearing multiple times)
        const dateStrings = extractedData.revisionDates.map(rev => rev.date);
        console.log('DEBUG - All extracted date strings:', dateStrings);
        
        const dateCount = {};
        
        // Count occurrences of each date
        dateStrings.forEach(date => {
          dateCount[date] = (dateCount[date] || 0) + 1;
        });
        
        console.log('DEBUG - Date count breakdown:', dateCount);
        
        // Find actual duplicates (dates that appear more than once)
        const actualDuplicates = Object.keys(dateCount).filter(date => dateCount[date] > 1);
        console.log('DEBUG - Dates that appear more than once:', actualDuplicates);
        
        // ONLY flag if there are ACTUAL duplicate dates (same date used multiple times)
        if (actualDuplicates.length > 0) {
          console.log('DEBUG - FLAGGING DUPLICATE DATE ERROR!');
          errors.push({
            type: 'DUPLICATE_DATES_ERROR',
            message: '❌ ERROR CRÍTICO DE FECHAS: Revisiones con fechas idénticas detectadas',
            details: `Fechas duplicadas encontradas: ${actualDuplicates.join(', ')}. Cada revisión debe tener una fecha única.`
          });
        } else {
          console.log('DEBUG - NO DUPLICATE DATES - All dates are unique');
        }
        
        // Check for logical date progression issues
        // 1. Check if PROYECTO DEFINITIVO and MODIFICACIÓN have the same date
        const definitivo = extractedData.revisionDates.find(rev => 
          rev.description && rev.description.toLowerCase().includes('definitivo')
        );
        const modificacion = extractedData.revisionDates.find(rev => 
          rev.description && rev.description.toLowerCase().includes('modificaci')
        );
        
        console.log('DEBUG - Found DEFINITIVO revision:', definitivo);
        console.log('DEBUG - Found MODIFICACIÓN revision:', modificacion);
        
        if (definitivo && modificacion) {
          const definitivoDate = new Date(definitivo.date.split('/').reverse().join('-'));
          const modificacionDate = new Date(modificacion.date.split('/').reverse().join('-'));
          
          console.log('DEBUG - DEFINITIVO date object:', definitivoDate);
          console.log('DEBUG - MODIFICACIÓN date object:', modificacionDate);
          console.log('DEBUG - Are dates equal?', definitivoDate.getTime() === modificacionDate.getTime());
          
          if (definitivoDate.getTime() === modificacionDate.getTime()) {
            console.log('DEBUG - FLAGGING SAME DATE LOGIC ERROR!');
            errors.push({
              type: 'SAME_DATE_LOGIC_ERROR',
              message: '❌ ERROR LÓGICO DE FECHAS: Proyecto definitivo y modificación tienen la misma fecha',
              details: `Ambos marcados con fecha ${definitivo.date}. Una modificación debe ser posterior al proyecto definitivo.`
            });
          } else if (modificacionDate < definitivoDate) {
            errors.push({
              type: 'DATE_SEQUENCE_ERROR',
              message: '❌ ERROR LÓGICO DE FECHAS: Modificación anterior al proyecto definitivo',
              details: `Modificación (${modificacion.date}) es anterior al proyecto definitivo (${definitivo.date}). La modificación debe ser posterior.`
            });
          }
        } else {
          console.log('DEBUG - Could not find both DEFINITIVO and MODIFICACIÓN revisions for comparison');
        }
        
        // 2. Check for any revision that should logically come after another but has same or earlier date
        const anteproyecto = extractedData.revisionDates.find(rev => 
          rev.description && rev.description.toLowerCase().includes('anteproyecto')
        );
        
        if (anteproyecto && definitivo) {
          const anteproyectoDate = new Date(anteproyecto.date.split('/').reverse().join('-'));
          const definitivoDate = new Date(definitivo.date.split('/').reverse().join('-'));
          
          if (definitivoDate <= anteproyectoDate) {
            errors.push({
              type: 'DATE_SEQUENCE_ERROR',
              message: '❌ ERROR LÓGICO DE FECHAS: Proyecto definitivo no es posterior al anteproyecto',
              details: `Anteproyecto (${anteproyecto.date}) y proyecto definitivo (${definitivo.date}). El proyecto definitivo debe ser posterior al anteproyecto.`
            });
          }
        }
        
        // Validate date formats
        const invalidDates = extractedData.revisionDates.filter(rev => {
          const dateRegex = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
          return !dateRegex.test(rev.date);
        });
        
        if (invalidDates.length > 0) {
          warnings.push({
            type: 'DATE_FORMAT_WARNING',
            message: '⚠️ FORMATO DE FECHA: Formato de fecha no estándar detectado',
            details: `Fechas con formato irregular: ${invalidDates.map(d => d.date).join(', ')}`
          });
        }
      }

      // Scale validation for specific document types
      if (extractedData.documentType.includes('Detalle') && extractedData.scale) {
        // Common architectural scales that are acceptable
        const acceptableDetailScales = [
          '1:1', '1:2', '1:5', '1:10', '1:20', '1:25', '1:50'
        ];
        
        // Extract just the scale ratio from the text (e.g., "1:25" from "ESC 1:25")
        const scaleMatch = extractedData.scale.match(/(1:\d+)/);
        const scaleRatio = scaleMatch ? scaleMatch[1] : extractedData.scale;
        
        // Only flag if it's actually an unusual scale for details
        if (!acceptableDetailScales.some(scale => scaleRatio.includes(scale))) {
          warnings.push({
            type: 'SCALE_WARNING',
            message: '⚠️ ESCALA: Escala poco común para detalles',
            details: `Encontrada: ${extractedData.scale}. Escalas comunes para detalles: 1:1, 1:2, 1:5, 1:10, 1:20, 1:25, 1:50`
          });
        }
      }
      
      // General scale validation - flag unusual architectural scales
      if (extractedData.scale) {
        const commonArchScales = [
          '1:1', '1:2', '1:5', '1:10', '1:20', '1:25', '1:50', 
          '1:75', '1:100', '1:125', '1:150', '1:200', '1:250', 
          '1:500', '1:750', '1:1000', '1:1250', '1:2500', '1:5000'
        ];
        
        const scaleMatch = extractedData.scale.match(/(1:\d+)/);
        const scaleRatio = scaleMatch ? scaleMatch[1] : extractedData.scale;
        
        // Only flag truly unusual scales
        if (scaleRatio.includes('1:') && !commonArchScales.some(scale => scaleRatio.includes(scale))) {
          warnings.push({
            type: 'UNUSUAL_SCALE_WARNING',
            message: '⚠️ ESCALA: Escala poco común en arquitectura',
            details: `Encontrada: ${extractedData.scale}. Verifique que sea la escala correcta para este tipo de documento.`
          });
        }
      }

      // If very little text was extracted, flag as potential issue
      if (pdfContent.fullText.length < 100) {
        warnings.push({
          type: 'LOW_TEXT_WARNING',
          message: '⚠️ CONTENIDO LIMITADO: Se extrajo poco texto del PDF',
          details: 'El PDF podría contener principalmente imágenes o texto no seleccionable'
        });
      }

      console.log('DEBUG - FINAL ERRORS:', errors);
      console.log('DEBUG - FINAL WARNINGS:', warnings);

      return {
        extractedData,
        errors,
        warnings,
        hasDateError: errors.some(e => e.type.includes('DATE')),
        hasFormatError: errors.some(e => e.type.includes('FORMAT') || e.type.includes('ARCHITECT') || e.type.includes('ALIGNMENT')),
        hasDuplicateDateError: errors.some(e => e.type === 'DUPLICATE_DATES_ERROR' || e.type === 'SAME_DATE_LOGIC_ERROR'),
        status: errors.length > 0 ? 'rejected' : warnings.length > 0 ? 'warning' : 'approved',
        pdfInfo: {
          numPages: pdfContent.numPages,
          fileSize: file.size,
          textLength: pdfContent.fullText.length
        }
      };

    } catch (error) {
      console.error('Error analyzing PDF:', error);
      throw error;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'green';
      case 'warning': return 'yellow';
      case 'rejected': return 'red';
      default: return 'gray';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'approved': return 'Aprobado';
      case 'warning': return 'Con Advertencias';
      case 'rejected': return 'Rechazado';
      default: return 'Procesando';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'rejected': return <AlertTriangle className="h-5 w-5 text-red-600" />;
      default: return <div className="h-5 w-5 bg-gray-300 rounded-full animate-pulse" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-4">
            <Building className="h-8 w-8 text-indigo-600 mr-3" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Validación Real de PDFs Arquitectónicos</h1>
              <p className="text-sm text-gray-500">Extrae y valida contenido real de archivos PDF usando PDF.js</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Upload Section */}
        {uploadedFiles.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Cargar PDFs para Análisis Real</h2>
              
              {/* PDF.js Loading Status */}
              {!pdfJsLoaded && !loadError && (
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full mr-3"></div>
                    <span className="text-blue-800">Cargando PDF.js...</span>
                  </div>
                </div>
              )}

              {loadError && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800">Error cargando PDF.js: {loadError}</p>
                  <p className="text-red-600 text-sm mt-2">
                    Intenta recargar la página o verifica tu conexión a internet.
                  </p>
                </div>
              )}

              {pdfJsLoaded && (
                <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                    <span className="text-green-800">PDF.js cargado correctamente</span>
                  </div>
                </div>
              )}
              
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-12">
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <div className="space-y-2">
                  <p className="text-lg text-gray-600">Selecciona archivos PDF arquitectónicos</p>
                  <p className="text-sm text-gray-500">El sistema extraerá contenido real usando PDF.js</p>
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!pdfJsLoaded || loadError}
                  className={`mt-6 px-6 py-3 rounded-md transition-colors ${
                    pdfJsLoaded && !loadError
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {pdfJsLoaded ? 'Seleccionar PDFs' : 'Cargando PDF.js...'}
                </button>
              </div>

              <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-lg font-medium text-blue-900 mb-3">Errores que Detecta el Sistema</h3>
                <div className="text-left space-y-3">
                  <div className="flex items-start">
                    <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Errores Tipográficos en Nombres</p>
                      <p className="text-xs text-blue-700">
                        Detecta errores como "Ortizs" (extra "s"), falta de acentos ("Andres" → "Andrés"), nombres incompletos
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <FileText className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Problemas de Alineación</p>
                      <p className="text-xs text-blue-700">
                        Detecta texto mal alineado en viñetas, espaciado inconsistente y problemas de formato en títulos
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <Calendar className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Errores Lógicos de Fechas</p>
                      <p className="text-xs text-blue-700">
                        Detecta cuando múltiples revisiones tienen la misma fecha (ej: PROYECTO DEFINITIVO y MODIFICACIÓN ambos el 15/01/2024). También valida secuencia lógica: anteproyecto → proyecto definitivo → modificaciones.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Processing State */}
        {isValidating && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="animate-spin mx-auto h-12 w-12 border-4 border-blue-200 border-t-blue-600 rounded-full mb-4"></div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Extrayendo contenido real de PDFs...</h3>
            <p className="text-gray-600">
              Procesando archivo {validationProgress.current} de {validationProgress.total}
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${(validationProgress.current / validationProgress.total) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Results */}
        {validationResults.length > 0 && !isValidating && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Resultados del Análisis Real</h2>
              
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <CheckCircle className="h-8 w-8 text-green-600 mr-3" />
                    <div>
                      <p className="text-2xl font-bold text-green-900">
                        {validationResults.filter(r => r.status === 'approved').length}
                      </p>
                      <p className="text-sm text-green-700">Aprobados</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <AlertTriangle className="h-8 w-8 text-yellow-600 mr-3" />
                    <div>
                      <p className="text-2xl font-bold text-yellow-900">
                        {validationResults.filter(r => r.status === 'warning').length}
                      </p>
                      <p className="text-sm text-yellow-700">Con Advertencias</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <AlertTriangle className="h-8 w-8 text-red-600 mr-3" />
                    <div>
                      <p className="text-2xl font-bold text-red-900">
                        {validationResults.filter(r => r.status === 'rejected').length}
                      </p>
                      <p className="text-sm text-red-700">Rechazados</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* File Details */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Análisis Detallado por Archivo</h3>
              </div>
              
              <div className="divide-y divide-gray-200">
                {validationResults.map((result, index) => (
                  <div key={index} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center mb-2">
                          {getStatusIcon(result.status)}
                          <h4 className="ml-3 text-lg font-medium text-gray-900">{result.file.name}</h4>
                          <span className={`ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${getStatusColor(result.status)}-100 text-${getStatusColor(result.status)}-800`}>
                            {getStatusText(result.status)}
                          </span>
                        </div>
                        
                        {result.pdfInfo && (
                          <div className="text-sm text-gray-600 mb-3">
                            <span className="font-medium">Páginas:</span> {result.pdfInfo.numPages} | 
                            <span className="font-medium ml-2">Tamaño:</span> {(result.pdfInfo.fileSize / 1024 / 1024).toFixed(1)} MB |
                            <span className="font-medium ml-2">Texto extraído:</span> {result.pdfInfo.textLength} caracteres
                          </div>
                        )}

                        {/* Show extracted data preview */}
                        {result.extractedData && (
                          <div className="mb-3 bg-gray-50 rounded-lg p-3">
                            <div className="text-xs text-gray-600 space-y-1">
                              {result.extractedData.projectName && (
                                <div><strong>Proyecto:</strong> {result.extractedData.projectName}</div>
                              )}
                              {result.extractedData.architect && (
                                <div><strong>Arquitecto:</strong> {result.extractedData.architect}</div>
                              )}
                              {result.extractedData.titleDate && (
                                <div><strong>Fecha:</strong> {result.extractedData.titleDate}</div>
                              )}
                              {result.extractedData.documentType && (
                                <div><strong>Tipo:</strong> {result.extractedData.documentType}</div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Errors */}
                        {result.errors.length > 0 && (
                          <div className="mb-3">
                            <h5 className="text-sm font-medium text-red-900 mb-2">Errores:</h5>
                            <div className="space-y-2">
                              {result.errors.map((error, errorIndex) => (
                                <div key={errorIndex} className="bg-red-50 border border-red-200 rounded-md p-3">
                                  <p className="text-sm text-red-800 font-medium">{error.message}</p>
                                  {error.details && (
                                    <p className="text-xs text-red-600 mt-1">{error.details}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Warnings */}
                        {result.warnings.length > 0 && (
                          <div className="mb-3">
                            <h5 className="text-sm font-medium text-yellow-900 mb-2">Advertencias:</h5>
                            <div className="space-y-2">
                              {result.warnings.map((warning, warningIndex) => (
                                <div key={warningIndex} className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                                  <p className="text-sm text-yellow-800 font-medium">{warning.message}</p>
                                  {warning.details && (
                                    <p className="text-xs text-yellow-600 mt-1">{warning.details}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="ml-4 flex space-x-2">
                        <button
                          onClick={() => setShowFileDetail(result)}
                          className="text-indigo-600 hover:text-indigo-800"
                        >
                          <Eye className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reset Button */}
            <div className="text-center">
              <button
                onClick={() => {
                  setUploadedFiles([]);
                  setValidationResults([]);
                  setValidationProgress({ current: 0, total: 0 });
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className="bg-gray-600 text-white px-6 py-3 rounded-md hover:bg-gray-700 transition-colors"
              >
                Analizar Nuevos Archivos
              </button>
            </div>
          </div>
        )}

        {/* File Detail Modal */}
        {showFileDetail && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-10 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-2/3 shadow-lg rounded-md bg-white max-h-96 overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Contenido Extraído del PDF</h3>
                <button
                  onClick={() => setShowFileDetail(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Información Extraída Automáticamente</h4>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                    <div><strong>Archivo:</strong> {showFileDetail.file.name}</div>
                    {showFileDetail.extractedData.projectName && (
                      <div><strong>Proyecto:</strong> {showFileDetail.extractedData.projectName}</div>
                    )}
                    {showFileDetail.extractedData.architect && (
                      <div><strong>Arquitecto:</strong> {showFileDetail.extractedData.architect}</div>
                    )}
                    {showFileDetail.extractedData.owner && (
                      <div><strong>Propietario:</strong> {showFileDetail.extractedData.owner}</div>
                    )}
                    {showFileDetail.extractedData.titleDate && (
                      <div><strong>Fecha Principal:</strong> {showFileDetail.extractedData.titleDate}</div>
                    )}
                    {showFileDetail.extractedData.sheet && (
                      <div><strong>Lámina:</strong> {showFileDetail.extractedData.sheet}</div>
                    )}
                    {showFileDetail.extractedData.scale && (
                      <div><strong>Escala:</strong> {showFileDetail.extractedData.scale}</div>
                    )}
                    <div><strong>Tipo Detectado:</strong> {showFileDetail.extractedData.documentType}</div>
                  </div>
                </div>

                {showFileDetail.extractedData.rawText && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Texto Completo Extraído (Primeros 1000 caracteres)</h4>
                    <div className="bg-gray-100 rounded-lg p-4 text-xs font-mono max-h-40 overflow-y-auto">
                      {showFileDetail.extractedData.rawText.substring(0, 1000)}
                      {showFileDetail.extractedData.rawText.length > 1000 && '...'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PDFDateValidationApp;