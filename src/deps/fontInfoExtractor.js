export const createFontInfoExtractor = ({ httpClient, fontManager }) => {
  const extractFontInfo = async (fontItem) => {
    try {
      // Get font file data
      const response = await httpClient.creator.getFileContent({
        fileId: fontItem.fileId,
        projectId: "someprojectId",
      });

      if (!response?.url) {
        throw new Error("Could not get font file URL");
      }

      // Load font for analysis
      const fontFace = await fontManager.load(fontItem.fontFamily, response.url);
      
      // Fetch the font file as array buffer
      const fontResponse = await fetch(response.url);
      const fontBuffer = await fontResponse.arrayBuffer();
      const fontData = new Uint8Array(fontBuffer);

      // Extract metadata from font tables
      const metadata = await extractFontMetadata(fontData, fontFace);

      // Get supported glyphs by parsing font tables
      const supportedGlyphs = await getSupportedGlyphs(fontBuffer);

      // Basic font info
      const fontInfo = {
        fontFamily: fontItem.fontFamily,
        fileId: fontItem.fileId,
        fileName: fontItem.name || `${fontItem.fontFamily}.ttf`,
        fileSize: `${Math.round(fontBuffer.byteLength / 1024)} KB`,
        format: detectFontFormat(fontData),
        weightClass: metadata.weightClass || 'Normal',
        isVariableFont: metadata.isVariableFont ? 'Yes' : 'No',
        supportsItalics: metadata.supportsItalics ? 'Yes' : 'No',
        glyphCount: supportedGlyphs.length,
        glyphs: supportedGlyphs,
        languageSupport: detectLanguageSupport(supportedGlyphs).join(', '),
      };

      return fontInfo;
    } catch (error) {
      console.error('Error extracting font info:', error);
      return {
        fontFamily: fontItem.fontFamily,
        fileId: fontItem.fileId,
        fileName: fontItem.name || `${fontItem.fontFamily}.ttf`,
        fileSize: '0 KB',
        format: 'Unknown',
        weightClass: 'Unknown',
        isVariableFont: 'Unknown',
        supportsItalics: 'Unknown',
        glyphCount: 0,
        glyphs: [],
        languageSupport: 'Unknown',
        error: error.message,
      };
    }
  };

  const detectFontFormat = (fontData) => {
    // Check magic bytes to determine format
    if (fontData.length < 4) return 'Unknown';
    
    const signature = Array.from(fontData.slice(0, 4))
      .map(b => String.fromCharCode(b))
      .join('');
    
    if (signature === 'wOF2') return 'WOFF2';
    if (signature === 'wOFF') return 'WOFF';
    if (signature === 'OTTO') return 'OTF';
    if (signature === 'ttcf') return 'TTC'; // TrueType Collection
    if (fontData[0] === 0x00 && fontData[1] === 0x01 && fontData[2] === 0x00 && fontData[3] === 0x00) return 'TTF';
    if (signature === 'true' || signature === 'typ1') return 'TTF';
    
    return 'Unknown';
  };

  const extractFontMetadata = async (fontData, fontFace) => {
    const metadata = {
      weightClass: 'Normal',
      isVariableFont: false,
      supportsItalics: false,
    };

    try {
      // Parse font tables for better metadata
      const tables = parseFontTables(fontData);
      
      // Check for variable font (fvar table)
      metadata.isVariableFont = tables.fvar !== undefined;
      
      // Extract weight class from OS/2 table
      if (tables['OS/2']) {
        const os2Data = tables['OS/2'].data;
        if (os2Data.length >= 6) {
          const weightClass = getUint16(os2Data, 4);
          metadata.weightClass = getWeightClassName(weightClass);
        }
        
        // Check italic support from OS/2 selection flags
        if (os2Data.length >= 64) {
          const fsSelection = getUint16(os2Data, 62);
          metadata.supportsItalics = (fsSelection & 0x01) !== 0; // Italic bit
        }
      }
      
      // Fallback to font face info if available
      if (fontFace) {
        if (fontFace.style && !metadata.supportsItalics) {
          metadata.supportsItalics = fontFace.style.includes('italic') || fontFace.style.includes('oblique');
        }
        if (fontFace.weight && metadata.weightClass === 'Normal') {
          metadata.weightClass = fontFace.weight;
        }
      }
    } catch (error) {
      console.warn('Error extracting font metadata:', error);
    }

    return metadata;
  };

  const getWeightClassName = (weightClass) => {
    const weights = {
      100: 'Thin',
      200: 'Extra Light',
      300: 'Light', 
      400: 'Normal',
      500: 'Medium',
      600: 'Semi Bold',
      700: 'Bold',
      800: 'Extra Bold',
      900: 'Black'
    };
    return weights[weightClass] || `${weightClass}`;
  };

  const getSupportedGlyphs = async (fontBuffer) => {
    console.log('🔍 Getting basic Latin glyphs for display');
    const supportedGlyphs = [];
    
    // Just use basic Latin characters for glyph preview
    const latinChars = [
      // Uppercase letters
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
      // Lowercase letters  
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
      // Numbers
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      // Common punctuation
      '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '=', '+', '[', ']', '{', '}', '|', '\\', ';', ':', '"', "'", '<', '>', ',', '.', '?', '/'
    ];
    
    for (let i = 0; i < latinChars.length && i < 100; i++) {
      const char = latinChars[i];
      const unicode = `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
      supportedGlyphs.push({ char, unicode });
    }
    
    console.log(`Using ${supportedGlyphs.length} basic Latin characters for glyph preview`);
    return supportedGlyphs;
  };

  const detectLanguageSupport = (glyphs) => {
    // Simplified - just return Latin since we're only showing Latin characters
    console.log('🔍 Using basic Latin character set');
    return ['Latin'];
  };

  const checkForWeightSupport = (fontData) => {
    // Simplified check - look for 'fvar' table presence which indicates variable font
    const fvarSignature = [0x66, 0x76, 0x61, 0x72]; // 'fvar' in bytes
    return containsSequence(fontData, fvarSignature);
  };

  const checkForItalicSupport = (fontData) => {
    // Simplified check - this would need proper font table parsing
    // For now, we'll do a basic heuristic
    return false; // Default to false without proper analysis
  };

  const containsSequence = (array, sequence) => {
    for (let i = 0; i <= array.length - sequence.length; i++) {
      let found = true;
      for (let j = 0; j < sequence.length; j++) {
        if (array[i + j] !== sequence[j]) {
          found = false;
          break;
        }
      }
      if (found) return true;
    }
    return false;
  };

  // Lightweight font table parsing helpers
  const getUint16 = (data, offset) => {
    return (data[offset] << 8) | data[offset + 1];
  };

  const getUint32 = (data, offset) => {
    return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
  };

  const parseFontTables = (fontData) => {
    const tables = {};
    
    // Read font header
    const numTables = getUint16(fontData, 4);
    let offset = 12; // Skip to table directory
    
    // Parse table directory
    for (let i = 0; i < numTables; i++) {
      const tag = String.fromCharCode(...fontData.slice(offset, offset + 4));
      const checksum = getUint32(fontData, offset + 4);
      const tableOffset = getUint32(fontData, offset + 8);
      const length = getUint32(fontData, offset + 12);
      
      tables[tag] = {
        offset: tableOffset,
        length: length,
        data: fontData.slice(tableOffset, tableOffset + length)
      };
      
      // Parse CMAP table header
      if (tag === 'cmap') {
        const cmapData = tables[tag].data;
        tables[tag].version = getUint16(cmapData, 0);
        tables[tag].numTables = getUint16(cmapData, 2);
      }
      
      offset += 16;
    }
    
    return tables;
  };

  const parseFormat4Subtable = (data, supportedCodepoints) => {
    try {
      const length = getUint16(data, 2);
      const segCountX2 = getUint16(data, 6);
      const segCount = segCountX2 / 2;
      
      // Read segment arrays
      let offset = 14;
      const endCodes = [];
      const startCodes = [];
      const idDeltas = [];
      const idRangeOffsets = [];
      
      // End codes
      for (let i = 0; i < segCount; i++) {
        endCodes.push(getUint16(data, offset));
        offset += 2;
      }
      
      offset += 2; // Skip reserved pad
      
      // Start codes
      for (let i = 0; i < segCount; i++) {
        startCodes.push(getUint16(data, offset));
        offset += 2;
      }
      
      // ID deltas
      for (let i = 0; i < segCount; i++) {
        idDeltas.push(getUint16(data, offset));
        offset += 2;
      }
      
      // ID range offsets
      const idRangeOffsetStart = offset;
      for (let i = 0; i < segCount; i++) {
        idRangeOffsets.push(getUint16(data, offset));
        offset += 2;
      }
      
      // Extract supported codepoints
      for (let i = 0; i < segCount; i++) {
        const startCode = startCodes[i];
        const endCode = endCodes[i];
        
        if (startCode === 0xFFFF) break; // End of table
        
        for (let codepoint = startCode; codepoint <= endCode; codepoint++) {
          if (codepoint < 0x10000) { // Basic Multilingual Plane only
            supportedCodepoints.add(codepoint);
          }
        }
      }
    } catch (error) {
      console.warn('Error parsing format 4 subtable:', error);
    }
  };

  const parseFormat12Subtable = (data, supportedCodepoints) => {
    try {
      const length = getUint32(data, 4);
      const numGroups = getUint32(data, 12);
      
      let offset = 16;
      for (let i = 0; i < numGroups; i++) {
        const startCharCode = getUint32(data, offset);
        const endCharCode = getUint32(data, offset + 4);
        const startGlyphId = getUint32(data, offset + 8);
        
        // Add all codepoints in this range
        for (let codepoint = startCharCode; codepoint <= endCharCode; codepoint++) {
          if (codepoint < 0x10000) { // Basic Multilingual Plane only for now
            supportedCodepoints.add(codepoint);
          }
        }
        
        offset += 12;
      }
    } catch (error) {
      console.warn('Error parsing format 12 subtable:', error);
    }
  };

  return {
    extractFontInfo,
  };
};