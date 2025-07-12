export const handleOnMount = async (deps) => {
  const { props = {}, loadFontFile } = deps;
  const { fontFamily } = props;
  
  // Only load font if fontFamily is provided and not a generic fallback
  if (fontFamily && fontFamily !== 'sans-serif' && fontFamily !== 'serif' && fontFamily !== 'monospace') {
    try {
      // Create a font item object for loadFontFile
      const fontItem = {
        fontFamily: fontFamily
      };
      
      await loadFontFile(fontItem);
    } catch (error) {
      console.warn(`Failed to load font: ${fontFamily}`, error);
    }
  }
};