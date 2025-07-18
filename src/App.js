import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, FileText, CheckCircle, AlertTriangle, 
  X, Eye, Calendar, Building, RefreshCw, Plus, Settings, FolderPlus
} from 'lucide-react';

const PDFDateValidationApp = () => {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [validationResults, setValidationResults] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [showFileDetail, setShowFileDetail] = useState(null);
  const [validationProgress, setValidationProgress] = useState({ current: 0, total: 0 });
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [isLoadingPdfJs, setIsLoadingPdfJs] = useState(false);
  
  // New project management states
  const [currentView, setCurrentView] = useState('projects'); // 'projects', 'validation'
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  
  const fileInputRef = useRef(null);

  // Predefined revision templates
  const revisionTemplates = [
    {
      id: 'basic',
      name: 'Básico - 3 Revisiones',
      description: 'Anteproyecto, Proyecto Definitivo, Modificación',
      revisions: [
        { number: '1', description: 'ANTEPROYECTO', required: true },
        { number: '2', description: 'PROYECTO DEFINITIVO', required: true },
        { number: '3', description: 'MODIFICACIÓN DE PROYECTO', required: false }
      ]
    },
    {
      id: 'extended',
      name: 'Extendido - 5 Revisiones',
      description: 'Incluye revisiones intermedias y múltiples modificaciones',
      revisions: [
        { number: '1', description: 'ANTEPROYECTO', required: true },
        { number: '2', description: 'REVISIÓN ANTEPROYECTO', required: false },
        { number: '3', description: 'PROYECTO DEFINITIVO', required: true },
        { number: '4', description: 'MODIFICACIÓN DE PROYECTO', required: false },
        { number: '5', description: 'MODIFICACIÓN FINAL', required: false }
      ]
    },
    {
      id: 'detailed',
      name: 'Detallado - 7 Revisiones',
      description: 'Para proyectos grandes con múltiples etapas de revisión',
      revisions: [
        { number: '1', description: 'ANTEPROYECTO', required: true },
        { number: '2', description: 'REVISIÓN CLIENTE', required: false },
        { number: '3', description: 'PROYECTO BÁSICO', required: true },
        { number: '4', description: 'PROYECTO DEFINITIVO', required: true },
        { number: '5', description: 'REVISIÓN TÉCNICA', required: false },
        { number: '6', description: 'MODIFICACIÓN DE PROYECTO', required: false },
        { number: '7', description: 'VERSIÓN FINAL', required: false }
      ]
    },
    {
      id: 'custom',
      name: 'Personalizado',
      description: 'Define tus propias revisiones',
      revisions: []
    }
  ];

  // Load PDF.js dynamically from CDN
  useEffect(() => {
    loadPdfJs();
  }, []);

  const loadPdfJs = async () => {
    try {
      setIsLoadingPdfJs(true);
      setLoadError(null);

      // Check if PDF.js is already loaded
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        setPdfJsLoaded(true);
        setIsLoadingPdfJs(false);
        return;
      }

      // Load PDF.js from CDN
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      
      script.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          setPdfJsLoaded(true);
          setLoadError(null);
        } else {
          setLoadError('PDF.js failed to initialize properly');
        }
        setIsLoadingPdfJs(false);
      };
      
      script.onerror = () => {
        setLoadError('Failed to load PDF.js from CDN');
        setIsLoadingPdfJs(false);
      };
      
      document.head.appendChild(script);
    } catch (error) {
      setLoadError(`Error loading PDF.js: ${error.message}`);
      setIsLoadingPdfJs(false);
    }
  };

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
            message: 'Error al procesar el PDF',
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
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      throw new Error('El archivo es demasiado grande (máximo 50MB)');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        resolve(new Uint8Array(e.target.result));
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
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
      
      // Load PDF document with timeout
      const loadingTask = window.pdfjsLib.getDocument({ 
        data: arrayBuffer,
        disableStream: true,
        disableAutoFetch: true
      });
      
      const pdf = await Promise.race([
        loadingTask.promise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout loading PDF')), 30000)
        )
      ]);
      
      let fullText = '';
      const pageTexts = [];
      const textItems = [];
      const maxPages = Math.min(pdf.numPages, 20); // Limit to first 20 pages for performance
      
      // Extract text from each page
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        try {
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
            fontSize: item.transform[0]
          }));
          
          pageTexts.push(pageText);
          textItems.push(...pageTextItems);
          fullText += pageText + '\n';
        } catch (pageError) {
          console.warn(`Error processing page ${pageNum}:`, pageError);
          // Continue with other pages
        }
      }
      
      // Analyze layout for alignment issues
      const layoutAnalysis = analyzeLayoutAlignment(textItems);
      
      return {
        fullText,
        pageTexts,
        textItems,
        layoutAnalysis,
        numPages: pdf.numPages,
        processedPages: maxPages,
        metadata: await pdf.getMetadata().catch(() => null)
      };
      
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error(`Failed to extract text: ${error.message}`);
    }
  };

  const analyzeLayoutAlignment = (textItems) => {
    console.log('DEBUG - Analyzing layout alignment...');
    console.log('DEBUG - Text items count:', textItems.length);
    
    const issues = [];
    const alignmentTolerance = 2;
    
    if (textItems.length === 0) {
      issues.push('No text items found for alignment analysis');
      return {
        hasAlignmentIssues: true,
        formattingProblems: issues,
        titleBlockItemCount: 0,
        totalTextItems: 0
      };
    }
    
    // Group text items by approximate Y coordinate (horizontal alignment)
    const lineGroups = {};
    textItems.forEach(item => {
      if (item.text && item.text.trim().length > 0) {
        const roundedY = Math.round(item.y / 5) * 5;
        if (!lineGroups[roundedY]) {
          lineGroups[roundedY] = [];
        }
        lineGroups[roundedY].push(item);
      }
    });
    
    // Check for alignment issues in title block area
    const titleBlockItems = textItems.filter(item => {
      return item.y > 50 && item.y < 200 && item.x > 400;
    });
    
    console.log('DEBUG - Title block items found:', titleBlockItems.length);
    
    if (titleBlockItems.length > 0) {
      const leftAlignedItems = titleBlockItems.filter(item => {
        return item.text && item.text.match(/^(Arquitecto|Proyecto|Propietario|Escala|Fecha|Lamina)/i);
      });
      
      if (leftAlignedItems.length > 1) {
        const xCoords = leftAlignedItems.map(item => item.x);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        
        console.log('DEBUG - Left-aligned X coordinates:', xCoords);
        
        if (maxX - minX > alignmentTolerance * 3) {
          issues.push('Inconsistent left alignment in title block fields');
        }
      }
      
      const suspiciousItems = titleBlockItems.filter(item => {
        return item.text && item.text.length > 3 && (
          item.x < 50 || item.x > 800
        );
      });
      
      if (suspiciousItems.length > 0) {
        issues.push(`Text elements positioned outside expected boundaries: ${suspiciousItems.length} items`);
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
      const pdfContent = await extractTextFromPDF(file);
      
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
        rawText: pdfContent.fullText
      };

      const cleanText = pdfContent.fullText.replace(/\s+/g, ' ').trim();
      
      // Extract project information
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

      // Architect name patterns
      const architectPatterns = [
        /\bJavier\s+Andr[eé]s\s+Moya\s+Ortiz\b/i,
        /arquitecto[:\s]*([^,\n\r]*Javier[^,\n\r]*)/i,
        /\bJavier\s+Andr[eé]s\s+(?:Moya\s+)?Ortiz\b/i
      ];
      
      for (const pattern of architectPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
          if (match[1]) {
            const nameMatch = match[1].match(/Javier\s+Andr[eé]s\s+(?:Moya\s+)?Ortiz/i);
            extractedData.architect = nameMatch ? nameMatch[0].trim() : match[1].trim();
          } else {
            extractedData.architect = match[0].trim();
          }
          break;
        }
      }

      // Owner patterns
      const ownerPatterns = [
        /\bOmar\s+Andr[eé]s\s+Param\s+Abu-ghosh\b/i,
        /\bNicol[aá]s\s+Andr[eé]s\s+Param\s+Abu-ghosh\b/i,
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

      // Address patterns
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

      // Enhanced date extraction
      console.log('DEBUG - STARTING ENHANCED DATE EXTRACTION');
      
      const revisionPatterns = [
        /(\d+\.?\d*)\s+(ANTEPROYECTO|PROYECTO\s*DEFINITIVO|MODIFICACI[OÓ]N\s*DE\s*PROYECTO)\s+(\d{1,2}\/\d{1,2}\/\d{4})/gi,
        /(\d+\.?\d*)\s*[-\s]*(ANTEPROYECTO|PROYECTO.*?DEFINITIVO|MODIFICACI[OÓ]N.*?PROYECTO)\s*[-\s]*(\d{1,2}\/\d{1,2}\/\d{4})/gi,
        /(\d+\.?\d*)\s+([A-ZÁÉÍÓÚÑ][^0-9\n\r]*?)\s+(\d{1,2}\/\d{1,2}\/\d{4})/gi
      ];
      
      const foundRevisions = [];
      
      for (let patternIndex = 0; patternIndex < revisionPatterns.length; patternIndex++) {
        const pattern = revisionPatterns[patternIndex];
        pattern.lastIndex = 0;
        let match;
        let matchCount = 0;
        
        while ((match = pattern.exec(cleanText)) !== null && matchCount < 50) {
          matchCount++;
          
          if (match.length >= 3) {
            const revisionNumber = match[1];
            const description = match[2];
            const date = match[3];
            
            if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(date)) {
              foundRevisions.push({
                number: revisionNumber,
                description: description.trim(),
                date: date.trim(),
                fullMatch: match[0],
                patternUsed: patternIndex + 1,
                position: match.index
              });
            }
          }
        }
      }
      
      // Deduplicate revisions
      const seenRevisions = new Set();
      const finalRevisions = [];
      
      foundRevisions.forEach(revision => {
        const revisionKey = `${revision.number}-${revision.description}-${revision.date}`;
        if (!seenRevisions.has(revisionKey)) {
          finalRevisions.push(revision);
          seenRevisions.add(revisionKey);
        }
      });
      
      extractedData.revisionDates = finalRevisions;
      
      // Look for title date
      const titleDateMatch = cleanText.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{4}/i);
      if (titleDateMatch) {
        extractedData.titleDate = titleDateMatch[0];
      }

      // Sheet patterns
      const sheetPatterns = [
        /l[aá]mina[:\s]*(\d+[-/]?\w*)/i,
        /hoja[:\s]*(\d+[-/]?\w*)/i,
        /\b(\d+)\b(?=\s*$)/m,
        /\b(\d{1,2}[-/]\w+)\b/g
      ];
      
      for (const pattern of sheetPatterns) {
        const match = cleanText.match(pattern);
        if (match && match[1]) {
          extractedData.sheet = match[1].trim();
          break;
        }
      }

      // Scale patterns
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
        const specificScale = foundScales.find(scale => /1:\d+/.test(scale));
        extractedData.scale = specificScale || foundScales[0];
      }

      // Document type detection
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
      
      if (!extractedData.documentType) {
        extractedData.documentType = 'Documento Arquitectónico';
      }

      // Validation logic
      const errors = [];
      const warnings = [];

      // Architect name validation
      const standardArchitectName = 'Javier Andrés Moya Ortiz';
      if (extractedData.architect) {
        const cleanExtractedName = extractedData.architect
          .replace(/\s+/g, ' ')
          .replace(/[^\w\sñáéíóúü]/gi, '')
          .trim();
        
        const cleanStandardName = standardArchitectName.replace(/\s+/g, ' ').trim();
        
        if (cleanExtractedName.toLowerCase() !== cleanStandardName.toLowerCase()) {
          if (cleanExtractedName.toLowerCase().includes('ortizs')) {
            errors.push({
              type: 'ARCHITECT_NAME_TYPO',
              message: 'ERROR TIPOGRÁFICO EN NOMBRE DE ARQUITECTO: "s" extra detectada',
              details: `Encontrado: "${extractedData.architect}" | Error: "Ortizs" debe ser "Ortiz" | Estándar: "${standardArchitectName}"`
            });
          } else if (cleanExtractedName.toLowerCase().includes('andres') && !cleanExtractedName.toLowerCase().includes('andrés')) {
            errors.push({
              type: 'ARCHITECT_NAME_ACCENT',
              message: 'ERROR DE ACENTUACIÓN EN NOMBRE DE ARQUITECTO: Falta acento en "Andrés"',
              details: `Encontrado: "${extractedData.architect}" | Debe ser: "${standardArchitectName}"`
            });
          } else if (!cleanExtractedName.toLowerCase().includes('moya')) {
            errors.push({
              type: 'ARCHITECT_NAME_INCOMPLETE',
              message: 'ERROR EN NOMBRE DE ARQUITECTO: Nombre incompleto, falta "Moya"',
              details: `Encontrado: "${extractedData.architect}" | Completo: "${standardArchitectName}"`
            });
          } else {
            errors.push({
              type: 'ARCHITECT_NAME_ERROR',
              message: 'ERROR EN NOMBRE DE ARQUITECTO: No coincide con el nombre estándar',
              details: `Encontrado: "${extractedData.architect}" | Estándar: "${standardArchitectName}"`
            });
          }
        }
      } else {
        warnings.push({
          type: 'ARCHITECT_NAME_MISSING',
          message: 'NOMBRE DE ARQUITECTO: No se pudo extraer automáticamente',
          details: 'Verifique manualmente que el nombre del arquitecto esté presente y sea legible'
        });
      }

      // Project name validation
      if (!extractedData.projectName || extractedData.projectName.length < 3) {
        warnings.push({
          type: 'PROJECT_NAME_WARNING',
          message: 'NOMBRE DE PROYECTO: No se pudo extraer o es muy corto',
          details: 'Verifique que el nombre del proyecto esté claramente indicado'
        });
      }

      // Date validation
      if (extractedData.revisionDates.length > 0) {
        const dateStrings = extractedData.revisionDates.map(rev => rev.date);
        const dateCount = {};
        
        dateStrings.forEach(date => {
          dateCount[date] = (dateCount[date] || 0) + 1;
        });
        
        const actualDuplicates = Object.keys(dateCount).filter(date => dateCount[date] > 1);
        
        if (actualDuplicates.length > 0) {
          errors.push({
            type: 'DUPLICATE_DATES_ERROR',
            message: 'ERROR CRÍTICO DE FECHAS: Revisiones con fechas idénticas detectadas',
            details: `Fechas duplicadas encontradas: ${actualDuplicates.join(', ')}. Cada revisión debe tener una fecha única.`
          });
        }
        
        // Check logical date progression
        const definitivo = extractedData.revisionDates.find(rev => 
          rev.description && rev.description.toLowerCase().includes('definitivo')
        );
        const modificacion = extractedData.revisionDates.find(rev => 
          rev.description && rev.description.toLowerCase().includes('modificaci')
        );
        
        if (definitivo && modificacion) {
          const definitivoDate = new Date(definitivo.date.split('/').reverse().join('-'));
          const modificacionDate = new Date(modificacion.date.split('/').reverse().join('-'));
          
          if (definitivoDate.getTime() === modificacionDate.getTime()) {
            errors.push({
              type: 'SAME_DATE_LOGIC_ERROR',
              message: 'ERROR LÓGICO DE FECHAS: Proyecto definitivo y modificación tienen la misma fecha',
              details: `Ambos marcados con fecha ${definitivo.date}. Una modificación debe ser posterior al proyecto definitivo.`
            });
          } else if (modificacionDate < definitivoDate) {
            errors.push({
              type: 'DATE_SEQUENCE_ERROR',
              message: 'ERROR LÓGICO DE FECHAS: Modificación anterior al proyecto definitivo',
              details: `Modificación (${modificacion.date}) es anterior al proyecto definitivo (${definitivo.date}).`
            });
          }
        }
      } else if (!extractedData.titleDate) {
        warnings.push({
          type: 'DATE_WARNING',
          message: 'FECHAS: No se pudieron extraer fechas automáticamente',
          details: 'Verifique manualmente las fechas en el documento'
        });
      }

      // Layout issues
      if (pdfContent.layoutAnalysis.hasAlignmentIssues) {
        warnings.push({
          type: 'LAYOUT_WARNING',
          message: 'FORMATO: Posibles problemas de alineación detectados',
          details: pdfContent.layoutAnalysis.formattingProblems.join('; ')
        });
      }

      // Low text content warning
      if (pdfContent.fullText.length < 100) {
        warnings.push({
          type: 'LOW_TEXT_WARNING',
          message: 'CONTENIDO LIMITADO: Se extrajo poco texto del PDF',
          details: 'El PDF podría contener principalmente imágenes o texto no seleccionable'
        });
      }

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
          processedPages: pdfContent.processedPages,
          fileSize: file.size,
          textLength: pdfContent.fullText.length,
          hasMetadata: !!pdfContent.metadata
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

  const retryPdfJsLoad = () => {
    setPdfJsLoaded(false);
    setLoadError(null);
    loadPdfJs();
  };

  const resetApp = () => {
    setUploadedFiles([]);
    setValidationResults([]);
    setValidationProgress({ current: 0, total: 0 });
    setShowFileDetail(null);
    setCurrentView('projects');
    setCurrentProject(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Project management functions
  const createProject = (projectData) => {
    const newProject = {
      id: Date.now().toString(),
      ...projectData,
      createdAt: new Date().toISOString(),
      template: null,
      validationResults: []
    };
    setProjects([...projects, newProject]);
    setCurrentProject(newProject);
    setShowCreateProject(false);
    setShowTemplateSelector(true);
  };

  const selectTemplate = (templateId) => {
    if (currentProject) {
      const template = revisionTemplates.find(t => t.id === templateId);
      const updatedProject = {
        ...currentProject,
        template: template
      };
      setCurrentProject(updatedProject);
      setProjects(projects.map(p => p.id === currentProject.id ? updatedProject : p));
      setShowTemplateSelector(false);
      setCurrentView('validation');
    }
  };

  const ProjectCreationForm = () => {
    const [formData, setFormData] = useState({
      name: '',
      number: '',
      author: '',
      year: new Date().getFullYear()
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      if (!formData.name || !formData.number || !formData.author) {
        alert('Por favor completa todos los campos obligatorios');
        return;
      }
      createProject(formData);
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
        <div className="relative p-8 border w-full max-w-lg shadow-2xl rounded-2xl bg-white">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-2xl font-bold text-slate-800">
                Nuevo Proyecto
              </h3>
              <p className="text-slate-600 mt-1">Información básica del proyecto arquitectónico</p>
            </div>
            <button
              onClick={() => setShowCreateProject(false)}
              className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-xl transition-all duration-200"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nombre del Proyecto *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all duration-200"
                  placeholder="ej: Casa Hermanos"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Número de Proyecto *
                </label>
                <input
                  type="text"
                  value={formData.number}
                  onChange={(e) => setFormData({...formData, number: e.target.value})}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all duration-200"
                  placeholder="ej: 2024-001"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Autor/Arquitecto *
                </label>
                <input
                  type="text"
                  value={formData.author}
                  onChange={(e) => setFormData({...formData, author: e.target.value})}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all duration-200"
                  placeholder="ej: Javier Andrés Moya Ortiz"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Año
                </label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({...formData, year: parseInt(e.target.value)})}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all duration-200"
                  min="2020"
                  max="2030"
                />
              </div>
            </div>
            
            <div className="flex space-x-4 pt-6">
              <button
                type="button"
                onClick={() => setShowCreateProject(false)}
                className="flex-1 px-6 py-3 border-2 border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-xl hover:bg-slate-800 transition-all duration-300 shadow-lg hover:shadow-xl font-semibold"
              >
                Crear Proyecto
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const TemplateSelector = () => {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
        <div className="relative p-8 border w-full max-w-5xl shadow-2xl rounded-2xl bg-white/95 backdrop-blur-sm max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                Seleccionar Template de Revisión
              </h3>
              <p className="text-slate-600 mt-1">
                Configura las revisiones esperadas para tu proyecto: <strong>{currentProject?.name}</strong>
              </p>
            </div>
            <button
              onClick={() => setShowTemplateSelector(false)}
              className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-xl transition-all duration-200"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {revisionTemplates.map((template, index) => (
              <div
                key={template.id}
                className="group relative overflow-hidden border-2 border-slate-200 rounded-2xl p-6 hover:border-slate-400 cursor-pointer transition-all duration-300 bg-gradient-to-br from-white to-slate-50 hover:shadow-xl"
                onClick={() => selectTemplate(template.id)}
              >
                <div className="absolute top-4 right-4 h-8 w-8 bg-gradient-to-br from-slate-600 to-slate-700 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <span className="text-white font-bold text-sm">{index + 1}</span>
                </div>
                
                <div className="mb-4">
                  <h4 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-slate-700 transition-colors">
                    {template.name}
                  </h4>
                  <p className="text-sm text-slate-600 leading-relaxed">{template.description}</p>
                </div>
                
                {template.revisions.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      Revisiones incluidas:
                    </p>
                    <div className="space-y-2">
                      {template.revisions.map((revision, revIndex) => (
                        <div key={revIndex} className="flex items-center text-xs bg-white/50 rounded-lg p-2 group-hover:bg-slate-50/50 transition-colors">
                          <div className="h-6 w-6 bg-gradient-to-br from-slate-400 to-slate-500 rounded-full flex items-center justify-center mr-3 text-white font-bold text-xs">
                            {revision.number}
                          </div>
                          <span className="flex-1 text-slate-700 font-medium">{revision.description}</span>
                          {revision.required && (
                            <div className="h-2 w-2 bg-red-500 rounded-full ml-2" title="Obligatorio"></div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {template.id === 'custom' && (
                  <div className="mt-4 p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-800 font-medium">
                      Podrás definir tus propias revisiones después de seleccionar esta opción
                    </p>
                  </div>
                )}
                
                <div className="absolute inset-0 border-2 border-transparent group-hover:border-slate-400 rounded-2xl transition-all duration-300 pointer-events-none"></div>
              </div>
            ))}
          </div>
          
          <div className="mt-8 p-4 bg-gradient-to-r from-slate-50 to-gray-50 border border-slate-200 rounded-xl">
            <p className="text-sm text-slate-700">
              <strong>Tip:</strong> El template seleccionado determinará qué revisiones debe contener tu PDF y cómo se validarán las fechas y secuencias.
            </p>
          </div>
        </div>
      </div>
    );
  };

  const ProjectsList = () => {
    return (
      <div className="space-y-8">
        {/* Project Creation Header */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <div className="px-8 py-8">
            <div className="flex items-center justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center mb-4">
                  <div className="h-12 w-12 bg-slate-100 rounded-xl flex items-center justify-center mr-4 border border-slate-200">
                    <Plus className="h-6 w-6 text-slate-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800">
                    Crear proyecto con información básica
                  </h2>
                </div>
                <p className="text-lg text-slate-600 leading-relaxed">
                  Inicia creando un proyecto con información esencial: nombre, número, autor y año. 
                  <span className="block text-base text-slate-500 mt-2">
                    Cada proyecto tendrá su propio template de revisión personalizado.
                  </span>
                </p>
              </div>
              <div className="hidden md:block">
                <button
                  onClick={() => setShowCreateProject(true)}
                  className="flex items-center px-8 py-4 bg-slate-700 text-white rounded-xl hover:bg-slate-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-semibold text-lg"
                >
                  <Plus className="h-5 w-5 mr-3" />
                  Crear Nuevo Proyecto
                </button>
              </div>
            </div>
            <div className="md:hidden mt-6">
              <button
                onClick={() => setShowCreateProject(true)}
                className="w-full flex items-center justify-center px-6 py-3 bg-slate-700 text-white rounded-xl hover:bg-slate-800 transition-all duration-300 shadow-lg font-semibold"
              >
                <Plus className="h-5 w-5 mr-2" />
                Crear Nuevo Proyecto
              </button>
            </div>
          </div>
        </div>

        {/* Projects List */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50">
          <div className="px-8 py-6 border-b border-slate-200/50">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Proyectos existentes</h3>
                <p className="text-sm text-slate-600 mt-1">Gestiona y organiza tus proyectos arquitectónicos</p>
              </div>
              <button
                onClick={() => setShowCreateProject(true)}
                className="flex items-center px-5 py-2.5 bg-gradient-to-r from-slate-700 to-slate-800 text-white rounded-xl hover:from-slate-800 hover:to-slate-900 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-medium"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nuevo
              </button>
            </div>
          </div>
          
          {projects.length === 0 ? (
            <div className="p-12 text-center">
              <div className="h-20 w-20 bg-gradient-to-br from-slate-200 to-slate-300 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <FolderPlus className="h-10 w-10 text-slate-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">No hay proyectos creados</h3>
              <p className="text-slate-600 mb-8 max-w-md mx-auto leading-relaxed">
                Crea tu primer proyecto para comenzar a validar PDFs arquitectónicos con nuestro sistema inteligente
              </p>
              <button
                onClick={() => setShowCreateProject(true)}
                className="px-8 py-3 bg-gradient-to-r from-slate-700 to-slate-800 text-white rounded-xl hover:from-slate-800 hover:to-slate-900 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-semibold"
              >
                Crear Primer Proyecto
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/50">
              {projects.map((project, index) => (
                <div key={project.id} className="p-8 hover:bg-gradient-to-r hover:from-slate-50/50 hover:to-slate-50/30 transition-all duration-300 group">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center mb-3">
                        <div className="h-10 w-10 bg-gradient-to-br from-slate-600 to-slate-700 rounded-xl flex items-center justify-center mr-4 shadow-lg">
                          <span className="text-white font-bold text-sm">{index + 1}</span>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 group-hover:text-slate-700 transition-colors">
                          {project.name}
                        </h3>
                      </div>
                      <div className="grid md:grid-cols-2 gap-3 text-sm">
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <span className="font-semibold text-slate-700 w-20">Número:</span>
                            <span className="text-slate-600">{project.number}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="font-semibold text-slate-700 w-20">Autor:</span>
                            <span className="text-slate-600">{project.author}</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <span className="font-semibold text-slate-700 w-20">Año:</span>
                            <span className="text-slate-600">{project.year}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="font-semibold text-slate-700 w-20">Creado:</span>
                            <span className="text-slate-600">{new Date(project.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      {project.template && (
                        <div className="mt-3 px-3 py-2 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg">
                          <span className="text-sm font-medium text-emerald-700">
                            Template: {project.template.name}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex space-x-3 ml-6">
                      {!project.template ? (
                        <button
                          onClick={() => {
                            setCurrentProject(project);
                            setShowTemplateSelector(true);
                          }}
                          className="flex items-center px-4 py-2.5 text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-medium"
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Configurar Template
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setCurrentProject(project);
                            setCurrentView('validation');
                          }}
                          className="flex items-center px-4 py-2.5 text-sm bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl hover:from-emerald-700 hover:to-emerald-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-medium"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Validar PDFs
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100" style={{fontFamily: 'Arial, sans-serif', fontSize: '.875em', lineHeight: '20px'}}>
      <header className="bg-white/80 backdrop-blur-sm shadow-lg border-b border-slate-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-5">
            <div className="flex items-center">
              <div className="relative">
                <Building className="h-10 w-10 text-slate-700 mr-4" />
                <div className="absolute -top-1 -right-1 h-4 w-4 bg-gradient-to-r from-slate-600 to-slate-700 rounded-full flex items-center justify-center">
                  <div className="h-1.5 w-1.5 bg-white rounded-full"></div>
                </div>
              </div>
              <div>
                <h1 className="font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent" style={{fontSize: '1.5rem'}}>
                  {currentProject ? `${currentProject.name}` : 'ArchiValidator Pro'}
                </h1>
                <p className="text-slate-600 font-medium" style={{fontSize: '.75rem'}}>
                  {currentProject 
                    ? `${currentProject.number} • ${currentProject.author} • ${currentProject.year}`
                    : 'Sistema profesional de validación de PDF'
                  }
                </p>
              </div>
            </div>
            <div className="flex space-x-3">
              {currentView === 'validation' && (
                <button
                  onClick={() => {
                    setCurrentView('projects');
                    setCurrentProject(null);
                    setUploadedFiles([]);
                    setValidationResults([]);
                  }}
                  className="flex items-center px-5 py-2.5 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-xl hover:from-slate-700 hover:to-slate-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-medium"
                  style={{fontSize: '.75rem'}}
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Proyectos
                </button>
              )}
              {validationResults.length > 0 && currentView === 'validation' && (
                <button
                  onClick={resetApp}
                  className="flex items-center px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl hover:from-emerald-700 hover:to-emerald-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-medium"
                  style={{fontSize: '.75rem'}}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Nuevo Análisis
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Project Management View */}
        {currentView === 'projects' && <ProjectsList />}

        {/* PDF Validation View */}
        {currentView === 'validation' && currentProject && (
          <>
            {/* Current Project Info */}
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{currentProject.name}</h3>
                  <p className="text-sm text-gray-600">
                    Template: {currentProject.template?.name} | 
                    {currentProject.template?.revisions.length} revisiones configuradas
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCurrentProject(currentProject);
                    setShowTemplateSelector(true);
                  }}
                  className="flex items-center px-3 py-2 text-sm bg-slate-100 text-slate-800 rounded-md hover:bg-slate-200 transition-colors"
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Cambiar Template
                </button>
              </div>
            </div>

            {/* Upload Section */}
            {uploadedFiles.length === 0 && (
              <div className="bg-white rounded-lg shadow p-8">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Cargar PDFs para Análisis Real</h2>
                  
                  {/* PDF.js Loading Status */}
                  {isLoadingPdfJs && (
                    <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full mr-3"></div>
                        <span className="text-blue-800">Cargando PDF.js...</span>
                      </div>
                    </div>
                  )}

                  {loadError && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-red-800 mb-3">Error cargando PDF.js: {loadError}</p>
                      <button
                        onClick={retryPdfJsLoad}
                        className="inline-flex items-center px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Reintentar
                      </button>
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
                      <p className="text-sm text-gray-500">El sistema extraerá contenido real usando PDF.js (máximo 50MB por archivo)</p>
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
                      disabled={!pdfJsLoaded || loadError || isLoadingPdfJs}
                      className={`mt-6 px-6 py-3 rounded-md transition-colors ${
                        pdfJsLoaded && !loadError && !isLoadingPdfJs
                          ? 'bg-slate-600 text-white hover:bg-slate-700'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {pdfJsLoaded ? 'Seleccionar PDFs' : 'Cargando PDF.js...'}
                    </button>
                  </div>

                  {/* Template Info */}
                  {currentProject.template && (
                    <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
                      <h3 className="text-lg font-medium text-blue-900 mb-3">Template de Revisión: {currentProject.template.name}</h3>
                      <div className="text-left space-y-2">
                        <p className="text-sm text-blue-800 mb-3">{currentProject.template.description}</p>
                        <div className="grid md:grid-cols-2 gap-2">
                          {currentProject.template.revisions.map((revision, index) => (
                            <div key={index} className="flex items-center text-sm">
                              <span className="font-medium text-blue-900 w-8">{revision.number}.</span>
                              <span className="text-blue-700 flex-1">{revision.description}</span>
                              {revision.required && <span className="text-red-600 ml-2">*</span>}
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-blue-600 mt-3">* = Revisión obligatoria</p>
                      </div>
                    </div>
                  )}

                  <div className="mt-8 bg-amber-50 border border-amber-200 rounded-lg p-6">
                    <h3 className="text-lg font-medium text-amber-900 mb-3">Errores que Detecta el Sistema</h3>
                    <div className="text-left space-y-3">
                      <div className="flex items-start">
                        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-amber-900">Errores Tipográficos en Nombres</p>
                          <p className="text-xs text-amber-700">
                            Detecta errores como "Ortizs" (extra "s"), falta de acentos ("Andres" → "Andrés"), nombres incompletos
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <FileText className="h-5 w-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-amber-900">Problemas de Alineación</p>
                          <p className="text-xs text-amber-700">
                            Detecta texto mal alineado en viñetas, espaciado inconsistente y problemas de formato en títulos
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <Calendar className="h-5 w-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-amber-900">Errores Lógicos de Fechas</p>
                          <p className="text-xs text-amber-700">
                            Detecta cuando múltiples revisiones tienen la misma fecha según el template configurado. También valida secuencia lógica de revisiones.
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
                <p className="text-gray-600 mb-4">
                  Procesando archivo {validationProgress.current} de {validationProgress.total}
                </p>
                <div className="w-full bg-gray-200 rounded-full h-2">
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
                              <div className="text-sm text-gray-600 mb-3 flex flex-wrap gap-4">
                                <span><strong>Páginas:</strong> {result.pdfInfo.processedPages}/{result.pdfInfo.numPages}</span>
                                <span><strong>Tamaño:</strong> {(result.pdfInfo.fileSize / 1024 / 1024).toFixed(1)} MB</span>
                                <span><strong>Texto extraído:</strong> {result.pdfInfo.textLength} caracteres</span>
                                {result.pdfInfo.hasMetadata && <span className="text-green-600">✓ Metadata</span>}
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
                                  {result.extractedData.revisionDates && result.extractedData.revisionDates.length > 0 && (
                                    <div><strong>Revisiones:</strong> {result.extractedData.revisionDates.length} encontradas</div>
                                  )}
                                  {result.extractedData.documentType && (
                                    <div><strong>Tipo:</strong> {result.extractedData.documentType}</div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Errors */}
                            {result.errors && result.errors.length > 0 && (
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
                            {result.warnings && result.warnings.length > 0 && (
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
                              className="text-slate-600 hover:text-slate-800 p-2 rounded-md hover:bg-slate-50 transition-colors"
                            >
                              <Eye className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Modals */}
        {showCreateProject && <ProjectCreationForm />}
        {showTemplateSelector && <TemplateSelector />}

        {/* File Detail Modal */}
        {showFileDetail && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-10 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-2/3 shadow-lg rounded-md bg-white max-h-96 overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Contenido Extraído del PDF</h3>
                <button
                  onClick={() => setShowFileDetail(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Información Extraída Automáticamente</h4>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                    <div><strong>Archivo:</strong> {showFileDetail.file.name}</div>
                    {showFileDetail.extractedData?.projectName && (
                      <div><strong>Proyecto:</strong> {showFileDetail.extractedData.projectName}</div>
                    )}
                    {showFileDetail.extractedData?.architect && (
                      <div><strong>Arquitecto:</strong> {showFileDetail.extractedData.architect}</div>
                    )}
                    {showFileDetail.extractedData?.owner && (
                      <div><strong>Propietario:</strong> {showFileDetail.extractedData.owner}</div>
                    )}
                    {showFileDetail.extractedData?.titleDate && (
                      <div><strong>Fecha Principal:</strong> {showFileDetail.extractedData.titleDate}</div>
                    )}
                    {showFileDetail.extractedData?.revisionDates && showFileDetail.extractedData.revisionDates.length > 0 && (
                      <div>
                        <strong>Revisiones:</strong>
                        <ul className="ml-4 mt-1 space-y-1">
                          {showFileDetail.extractedData.revisionDates.map((rev, idx) => (
                            <li key={idx} className="text-xs">
                              {rev.number} - {rev.description} - {rev.date}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {showFileDetail.extractedData?.sheet && (
                      <div><strong>Lámina:</strong> {showFileDetail.extractedData.sheet}</div>
                    )}
                    {showFileDetail.extractedData?.scale && (
                      <div><strong>Escala:</strong> {showFileDetail.extractedData.scale}</div>
                    )}
                    <div><strong>Tipo Detectado:</strong> {showFileDetail.extractedData?.documentType}</div>
                  </div>
                </div>

                {showFileDetail.extractedData?.rawText && (
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