const DEFAULT_PREVIEW_TEXT = "Aa 123";
const DEFAULT_PREVIEW_GLYPHS = [
  "A",
  "a",
  "B",
  "b",
  "1",
  "2",
  "3",
  "&",
  "@",
  "#",
  "!",
  "?",
];

const SCRIPT_PRESETS = [
  {
    id: "japanese",
    label: "Japanese",
    detailText: "あいうえおかきくけこ日人年",
    sampleText:
      "あいうえおかきくけこさしすせそのにとはをたでしてる日人年月日時本中大小",
    requiredText: "あいうえおかきくけこ日人年",
    ranges: [
      [0x3040, 0x309f],
      [0x30a0, 0x30ff],
      [0x3400, 0x4dbf],
      [0x4e00, 0x9fff],
    ],
  },
  {
    id: "han",
    label: "Han",
    detailText: "一二三四五六七八九十",
    sampleText: "一二三四五六七八九十的是不了人在有和这个",
    ranges: [
      [0x3400, 0x4dbf],
      [0x4e00, 0x9fff],
    ],
  },
  {
    id: "hangul",
    label: "Hangul",
    detailText: "가나다라마바사",
    sampleText: "가나다라마바사아자차카타파하거너더러머버서",
    ranges: [[0xac00, 0xd7af]],
  },
  {
    id: "hiragana",
    label: "Hiragana",
    detailText: "あいうえおかきくけこ",
    sampleText: "あいうえおかきくけこさしすせそたちつてとなにぬねの",
    ranges: [[0x3040, 0x309f]],
  },
  {
    id: "katakana",
    label: "Katakana",
    detailText: "アイウエオカキクケコ",
    sampleText: "アイウエオカキクケコサシスセソタチツテトナニヌネノ",
    ranges: [[0x30a0, 0x30ff]],
  },
  {
    id: "arabic",
    label: "Arabic",
    detailText: "ابتثجحخدذرز",
    sampleText: "ابتثجحخدذرزسشصضطظعغفقكلمنهوي",
    ranges: [
      [0x0600, 0x06ff],
      [0x0750, 0x077f],
      [0x08a0, 0x08ff],
    ],
  },
  {
    id: "devanagari",
    label: "Devanagari",
    detailText: "अआइईउऊएऐओऔ",
    sampleText: "अआइईउऊएऐओऔकखगघचछजझटठडढतथदधनपफबभमयरलवशषसह",
    ranges: [[0x0900, 0x097f]],
  },
  {
    id: "bengali",
    label: "Bengali",
    detailText: "অআইঈউঊএঐওঔ",
    sampleText: "অআইঈউঊএঐওঔকখগঘচছজঝটঠডঢতথদধনপফবভমযরলশসহ",
    ranges: [[0x0980, 0x09ff]],
  },
  {
    id: "tamil",
    label: "Tamil",
    detailText: "அஆஇஈஉஊஎஏஐ",
    sampleText: "அஆஇஈஉஊஎஏஐஒஓஔகஙசஞடணதநபமயரலவழளறன",
    ranges: [[0x0b80, 0x0bff]],
  },
  {
    id: "thai",
    label: "Thai",
    detailText: "กขฃคฆงจฉชซ",
    sampleText: "กขฃคฆงจฉชซญฎฏฐฑฒณดตถทธนบปผพภมยรลวศษสหฬอฮ",
    ranges: [[0x0e00, 0x0e7f]],
  },
  {
    id: "hebrew",
    label: "Hebrew",
    detailText: "אבגדהוזחטיכל",
    sampleText: "אבגדהוזחטיכלמנסעפצקרשת",
    ranges: [[0x0590, 0x05ff]],
  },
  {
    id: "ethiopic",
    label: "Ethiopic",
    detailText: "ሀሁሂሃሄህሆለ",
    sampleText: "ሀሁሂሃሄህሆለሉሊላሌልሎመሙሚማሜምሞሰሱሲሳሴስሶ",
    ranges: [[0x1200, 0x137f]],
  },
  {
    id: "khmer",
    label: "Khmer",
    detailText: "កខគឃងចឆជឈញ",
    sampleText: "កខគឃងចឆជឈញដឋឌឍណតថទធនបផពភមយរលវសហឡអ",
    ranges: [[0x1780, 0x17ff]],
  },
  {
    id: "georgian",
    label: "Georgian",
    detailText: "აბგდევზთიკლმ",
    sampleText: "აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ",
    ranges: [
      [0x10a0, 0x10ff],
      [0x2d00, 0x2d2f],
    ],
  },
  {
    id: "armenian",
    label: "Armenian",
    detailText: "ԱԲԳԴԵԶԷԸԹԺԻԼ",
    sampleText: "ԱԲԳԴԵԶԷԸԹԺԻԼԽԾԿՀՁՂՃՄՅՆՇՈՉՊՋՌՍՎՏՐՑՒՓՔՕՖ",
    ranges: [[0x0530, 0x058f]],
  },
  {
    id: "greek",
    label: "Greek",
    detailText: "ΑΒΓΔΕΖΗΘΙΚΛΜΝ",
    sampleText: "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω",
    ranges: [[0x0370, 0x03ff]],
  },
  {
    id: "cyrillic",
    label: "Cyrillic",
    detailText: "АБВГДЕЁЖЗИЙКЛМ",
    sampleText:
      "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя",
    ranges: [
      [0x0400, 0x04ff],
      [0x0500, 0x052f],
    ],
  },
  {
    id: "latin",
    label: "Latin",
    detailText: "ABCDEFGHIJKLM",
    sampleText:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?-_()[]{}@#&%+*/",
    ranges: [
      [0x0020, 0x007f],
      [0x00a0, 0x024f],
      [0x1e00, 0x1eff],
    ],
  },
];

const BLOCK_PRESETS = [
  ...SCRIPT_PRESETS,
  {
    id: "gujarati",
    label: "Gujarati",
    ranges: [[0x0a80, 0x0aff]],
  },
  {
    id: "gurmukhi",
    label: "Gurmukhi",
    ranges: [[0x0a00, 0x0a7f]],
  },
  {
    id: "telugu",
    label: "Telugu",
    ranges: [[0x0c00, 0x0c7f]],
  },
  {
    id: "kannada",
    label: "Kannada",
    ranges: [[0x0c80, 0x0cff]],
  },
  {
    id: "malayalam",
    label: "Malayalam",
    ranges: [[0x0d00, 0x0d7f]],
  },
  {
    id: "lao",
    label: "Lao",
    ranges: [[0x0e80, 0x0eff]],
  },
  {
    id: "sinhala",
    label: "Sinhala",
    ranges: [[0x0d80, 0x0dff]],
  },
  {
    id: "khmer",
    label: "Khmer",
    ranges: [[0x1780, 0x17ff]],
  },
  {
    id: "emoji",
    label: "Emoji",
    kind: "symbol",
    ranges: [[0x1f300, 0x1faff]],
  },
  {
    id: "arrows",
    label: "Arrows",
    kind: "symbol",
    ranges: [[0x2190, 0x21ff]],
  },
  {
    id: "math",
    label: "Math Symbols",
    kind: "symbol",
    ranges: [[0x2200, 0x22ff]],
  },
  {
    id: "geometric",
    label: "Geometric Shapes",
    kind: "symbol",
    ranges: [[0x25a0, 0x25ff]],
  },
  {
    id: "miscSymbols",
    label: "Misc Symbols",
    kind: "symbol",
    ranges: [[0x2600, 0x26ff]],
  },
  {
    id: "dingbats",
    label: "Dingbats",
    kind: "symbol",
    ranges: [[0x2700, 0x27bf]],
  },
];

const isWhitespaceCharacter = (char) => char.trim().length === 0;

const isControlCodePoint = (codePoint) => {
  return (
    codePoint <= 0x001f ||
    (codePoint >= 0x007f && codePoint <= 0x009f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2060 && codePoint <= 0x206f)
  );
};

const isCombiningMark = (codePoint) => {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  );
};

const isVariationSelector = (codePoint) => {
  return (
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  );
};

const isPrivateUseCodePoint = (codePoint) => {
  return (
    (codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
    (codePoint >= 0xf0000 && codePoint <= 0xffffd) ||
    (codePoint >= 0x100000 && codePoint <= 0x10fffd)
  );
};

const isPreviewableCodePoint = (codePoint) => {
  return !(
    isControlCodePoint(codePoint) ||
    isCombiningMark(codePoint) ||
    isVariationSelector(codePoint) ||
    isPrivateUseCodePoint(codePoint) ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  );
};

const getUint16 = (data, offset) => {
  return (data[offset] << 8) | data[offset + 1];
};

const getUint32 = (data, offset) => {
  return (
    data[offset] * 0x1000000 +
    (data[offset + 1] << 16) +
    (data[offset + 2] << 8) +
    data[offset + 3]
  );
};

const getSignature = (fontData) => {
  if (fontData.length < 4) {
    return "";
  }

  return Array.from(fontData.slice(0, 4))
    .map((value) => String.fromCharCode(value))
    .join("");
};

const detectFontFormat = (fontData) => {
  const signature = getSignature(fontData);

  if (signature === "wOF2") return "WOFF2";
  if (signature === "wOFF") return "WOFF";
  if (signature === "OTTO") return "OTF";
  if (signature === "ttcf") return "TTC";
  if (
    fontData[0] === 0x00 &&
    fontData[1] === 0x01 &&
    fontData[2] === 0x00 &&
    fontData[3] === 0x00
  ) {
    return "TTF";
  }
  if (signature === "true" || signature === "typ1") return "TTF";

  return "Unknown";
};

const mergeRanges = (ranges) => {
  if (!ranges.length) {
    return [];
  }

  const sortedRanges = [...ranges].sort((left, right) => {
    if (left[0] !== right[0]) {
      return left[0] - right[0];
    }

    return left[1] - right[1];
  });

  const merged = [sortedRanges[0].slice()];

  for (let index = 1; index < sortedRanges.length; index += 1) {
    const [start, end] = sortedRanges[index];
    const current = merged[merged.length - 1];

    if (start <= current[1] + 1) {
      current[1] = Math.max(current[1], end);
      continue;
    }

    merged.push([start, end]);
  }

  return merged;
};

const pushSupportedSegment = (ranges, start, end) => {
  if (start > end) {
    return;
  }

  ranges.push([start, end]);
};

const parseFormat4Ranges = (data, offset) => {
  const segCount = getUint16(data, offset + 6) / 2;
  const endCodeOffset = offset + 14;
  const startCodeOffset = endCodeOffset + segCount * 2 + 2;
  const idDeltaOffset = startCodeOffset + segCount * 2;
  const idRangeOffsetOffset = idDeltaOffset + segCount * 2;
  const ranges = [];

  for (let index = 0; index < segCount; index += 1) {
    const endCode = getUint16(data, endCodeOffset + index * 2);
    const startCode = getUint16(data, startCodeOffset + index * 2);

    if (startCode > endCode || (startCode === 0xffff && endCode === 0xffff)) {
      continue;
    }

    const idDelta = getUint16(data, idDeltaOffset + index * 2);
    const idRangeOffset = getUint16(data, idRangeOffsetOffset + index * 2);

    if (idRangeOffset === 0) {
      if (((startCode + idDelta) & 0xffff) === 0 && startCode === endCode) {
        continue;
      }

      pushSupportedSegment(ranges, startCode, endCode);
      continue;
    }

    const idRangeAddress = idRangeOffsetOffset + index * 2;
    let currentStart;

    for (let codePoint = startCode; codePoint <= endCode; codePoint += 1) {
      const glyphIndexOffset =
        idRangeAddress + idRangeOffset + (codePoint - startCode) * 2;

      if (glyphIndexOffset + 1 >= data.length) {
        break;
      }

      let glyphIndex = getUint16(data, glyphIndexOffset);
      if (glyphIndex !== 0) {
        glyphIndex = (glyphIndex + idDelta) & 0xffff;
      }

      if (glyphIndex === 0) {
        if (currentStart !== undefined) {
          pushSupportedSegment(ranges, currentStart, codePoint - 1);
          currentStart = undefined;
        }
        continue;
      }

      if (currentStart === undefined) {
        currentStart = codePoint;
      }
    }

    if (currentStart !== undefined) {
      pushSupportedSegment(ranges, currentStart, endCode);
    }
  }

  return ranges;
};

const parseFormat12Ranges = (data, offset, format) => {
  const groupCount = getUint32(data, offset + 12);
  const groupsOffset = offset + 16;
  const ranges = [];

  for (let index = 0; index < groupCount; index += 1) {
    const groupOffset = groupsOffset + index * 12;
    const startCharCode = getUint32(data, groupOffset);
    const endCharCode = getUint32(data, groupOffset + 4);
    const startGlyphId = getUint32(data, groupOffset + 8);

    if (format === 13) {
      if (startGlyphId !== 0) {
        pushSupportedSegment(ranges, startCharCode, endCharCode);
      }
      continue;
    }

    const supportedStart =
      startGlyphId === 0 ? startCharCode + 1 : startCharCode;
    pushSupportedSegment(ranges, supportedStart, endCharCode);
  }

  return ranges;
};

const isSupportedEncodingRecord = (platformId, encodingId) => {
  return (
    platformId === 0 ||
    (platformId === 3 &&
      (encodingId === 0 || encodingId === 1 || encodingId === 10))
  );
};

const parseCmapCoverageRanges = (cmapData) => {
  if (!cmapData || cmapData.length < 4) {
    return [];
  }

  const tableCount = getUint16(cmapData, 2);
  const ranges = [];
  const visitedSubtables = new Set();

  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = 4 + index * 8;
    const platformId = getUint16(cmapData, recordOffset);
    const encodingId = getUint16(cmapData, recordOffset + 2);
    const subtableOffset = getUint32(cmapData, recordOffset + 4);

    if (
      !isSupportedEncodingRecord(platformId, encodingId) ||
      visitedSubtables.has(subtableOffset) ||
      subtableOffset + 2 > cmapData.length
    ) {
      continue;
    }

    visitedSubtables.add(subtableOffset);
    const format = getUint16(cmapData, subtableOffset);

    if (format === 4) {
      ranges.push(...parseFormat4Ranges(cmapData, subtableOffset));
      continue;
    }

    if (format === 12 || format === 13) {
      ranges.push(...parseFormat12Ranges(cmapData, subtableOffset, format));
    }
  }

  return mergeRanges(ranges);
};

const parseSfntTables = (fontData, offsetTableOffset = 0) => {
  const tables = {};
  const numTables = getUint16(fontData, offsetTableOffset + 4);
  let directoryOffset = offsetTableOffset + 12;

  for (let index = 0; index < numTables; index += 1) {
    const tag = String.fromCharCode(
      ...fontData.slice(directoryOffset, directoryOffset + 4),
    );
    const tableOffset = getUint32(fontData, directoryOffset + 8);
    const length = getUint32(fontData, directoryOffset + 12);

    tables[tag] = {
      offset: tableOffset,
      length,
      data: fontData.slice(tableOffset, tableOffset + length),
    };

    directoryOffset += 16;
  }

  return tables;
};

const resolveSfntContext = (fontData, format) => {
  if (format === "TTF" || format === "OTF") {
    return {
      tables: parseSfntTables(fontData, 0),
    };
  }

  if (format === "TTC") {
    if (fontData.length < 16) {
      throw new Error("Invalid TTC header.");
    }

    const firstFontOffset = getUint32(fontData, 12);
    return {
      tables: parseSfntTables(fontData, firstFontOffset),
      previewNote: "Preview samples use the first face in this TTC collection.",
    };
  }

  if (format === "WOFF") {
    return {
      tables: undefined,
      previewNote: "Script-aware preview is unavailable for WOFF files yet.",
    };
  }

  if (format === "WOFF2") {
    return {
      tables: undefined,
      previewNote: "Script-aware preview is unavailable for WOFF2 files yet.",
    };
  }

  return {
    tables: undefined,
    previewNote: "Script-aware preview is unavailable for this font format.",
  };
};

const getWeightClassName = (weightClass) => {
  const weights = {
    100: "Thin",
    200: "Extra Light",
    300: "Light",
    400: "Normal",
    500: "Medium",
    600: "Semi Bold",
    700: "Bold",
    800: "Extra Bold",
    900: "Black",
  };

  return weights[weightClass] || `${weightClass}`;
};

const extractMetadata = ({ tables, fontFace }) => {
  const metadata = {
    weightClass: "Normal",
    isVariableFont: false,
    supportsItalics: false,
    glyphCount: undefined,
  };

  if (tables?.fvar) {
    metadata.isVariableFont = true;
  }

  if (tables?.["OS/2"]) {
    const os2Data = tables["OS/2"].data;

    if (os2Data.length >= 6) {
      metadata.weightClass = getWeightClassName(getUint16(os2Data, 4));
    }

    if (os2Data.length >= 64) {
      const fsSelection = getUint16(os2Data, 62);
      metadata.supportsItalics = (fsSelection & 0x01) !== 0;
    }
  }

  if (tables?.maxp?.data?.length >= 6) {
    metadata.glyphCount = getUint16(tables.maxp.data, 4);
  }

  if (fontFace?.style && !metadata.supportsItalics) {
    metadata.supportsItalics =
      fontFace.style.includes("italic") || fontFace.style.includes("oblique");
  }

  if (fontFace?.weight && metadata.weightClass === "Normal") {
    metadata.weightClass = fontFace.weight;
  }

  return metadata;
};

const intersectsRange = (leftStart, leftEnd, rightStart, rightEnd) => {
  const start = Math.max(leftStart, rightStart);
  const end = Math.min(leftEnd, rightEnd);

  if (start > end) {
    return 0;
  }

  return end - start + 1;
};

const countCoveredCodePoints = (coverageRanges, targetRanges) => {
  let count = 0;

  for (const [targetStart, targetEnd] of targetRanges) {
    for (const [coverageStart, coverageEnd] of coverageRanges) {
      count += intersectsRange(
        targetStart,
        targetEnd,
        coverageStart,
        coverageEnd,
      );
    }
  }

  return count;
};

const isCodePointCovered = (coverageRanges, codePoint) => {
  for (const [start, end] of coverageRanges) {
    if (codePoint < start) {
      return false;
    }

    if (codePoint <= end) {
      return true;
    }
  }

  return false;
};

const filterPreviewTextByCoverage = (sampleText, coverageRanges) => {
  let value = "";

  for (const char of sampleText) {
    if (isWhitespaceCharacter(char)) {
      value += char;
      continue;
    }

    const codePoint = char.codePointAt(0);
    if (
      codePoint !== undefined &&
      isCodePointCovered(coverageRanges, codePoint)
    ) {
      value += char;
    }
  }

  return value.trim();
};

const countPreviewCharacters = (text) => {
  let count = 0;

  for (const char of text) {
    if (!isWhitespaceCharacter(char)) {
      count += 1;
    }
  }

  return count;
};

const intersectRanges = (coverageRanges, targetRanges) => {
  const intersections = [];

  for (const [targetStart, targetEnd] of targetRanges) {
    for (const [coverageStart, coverageEnd] of coverageRanges) {
      const start = Math.max(targetStart, coverageStart);
      const end = Math.min(targetEnd, coverageEnd);

      if (start <= end) {
        intersections.push([start, end]);
      }
    }
  }

  return mergeRanges(intersections);
};

const collectSampleCodePoints = ({
  coverageRanges,
  targetRanges,
  limit,
  allowPrivateUse = false,
}) => {
  const candidates = [];
  const ranges = intersectRanges(coverageRanges, targetRanges);

  for (const [start, end] of ranges) {
    for (
      let codePoint = start;
      codePoint <= end && candidates.length < 96;
      codePoint += 1
    ) {
      if (!isPreviewableCodePoint(codePoint)) {
        continue;
      }

      if (!allowPrivateUse && isPrivateUseCodePoint(codePoint)) {
        continue;
      }

      const char = String.fromCodePoint(codePoint);
      if (isWhitespaceCharacter(char)) {
        continue;
      }

      candidates.push(codePoint);
    }

    if (candidates.length >= 96) {
      break;
    }
  }

  if (candidates.length <= limit) {
    return candidates;
  }

  const sampled = [];
  const sampledIndexes = new Set();

  for (let index = 0; index < limit; index += 1) {
    const candidateIndex = Math.min(
      candidates.length - 1,
      Math.floor((index * candidates.length) / limit),
    );

    if (sampledIndexes.has(candidateIndex)) {
      continue;
    }

    sampledIndexes.add(candidateIndex);
    sampled.push(candidates[candidateIndex]);
  }

  return sampled;
};

const buildGlyphEntries = (codePoints) => {
  return codePoints.map((codePoint) => ({
    char: String.fromCodePoint(codePoint),
    unicode: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
  }));
};

const buildTextGlyphEntries = (text) => {
  const glyphs = [];

  for (const char of text) {
    if (isWhitespaceCharacter(char)) {
      continue;
    }

    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }

    glyphs.push({
      char,
      unicode: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
    });
  }

  return glyphs;
};

const buildScriptMatchGlyphs = ({
  coverageRanges,
  scriptMatches,
  limit = 36,
}) => {
  const glyphCodePoints = [];
  const seenCodePoints = new Set();
  const visibleScriptMatches = scriptMatches.slice(0, 3);

  for (const scriptMatch of visibleScriptMatches) {
    const remainingSlots = limit - glyphCodePoints.length;
    if (remainingSlots <= 0) {
      break;
    }

    const targetLimit = Math.max(
      8,
      Math.min(remainingSlots, Math.ceil(limit / visibleScriptMatches.length)),
    );
    const sampledCodePoints = collectSampleCodePoints({
      coverageRanges,
      targetRanges: scriptMatch.ranges,
      limit: targetLimit,
    });

    for (const codePoint of sampledCodePoints) {
      if (glyphCodePoints.length >= limit || seenCodePoints.has(codePoint)) {
        continue;
      }

      seenCodePoints.add(codePoint);
      glyphCodePoints.push(codePoint);
    }
  }

  return buildGlyphEntries(glyphCodePoints);
};

const formatSupportedScriptsLabel = (scripts) => {
  if (!scripts.length) {
    return "Unknown";
  }

  return scripts.join(", ");
};

const getPreviewFontSize = (text = "") => {
  const length = Array.from(text).length;

  if (length <= 5) {
    return 60;
  }

  if (length <= 10) {
    return 48;
  }

  if (length <= 16) {
    return 38;
  }

  return 30;
};

const buildCoveragePreview = (coverageRanges) => {
  if (!coverageRanges.length) {
    return {
      previewMode: "fallback",
      primaryPreviewText: DEFAULT_PREVIEW_TEXT,
      previewRows: [
        {
          label: "",
          text: DEFAULT_PREVIEW_TEXT,
        },
      ],
      glyphs: buildGlyphEntries(
        DEFAULT_PREVIEW_GLYPHS.map((char) => char.codePointAt(0)),
      ),
      supportedScripts: [],
      supportedScriptsLabel: "Unknown",
      detailPreviewFontSize: getPreviewFontSize(DEFAULT_PREVIEW_TEXT),
    };
  }

  const scriptMatches = SCRIPT_PRESETS.map((preset, index) => {
    const coverageCount = countCoveredCodePoints(coverageRanges, preset.ranges);
    const sampleText = filterPreviewTextByCoverage(
      preset.sampleText,
      coverageRanges,
    );
    const detailText = filterPreviewTextByCoverage(
      preset.detailText ?? preset.sampleText,
      coverageRanges,
    );
    const requiredText = filterPreviewTextByCoverage(
      preset.requiredText ?? "",
      coverageRanges,
    );
    const hasRequiredCoverage = preset.requiredText
      ? countPreviewCharacters(requiredText) ===
        countPreviewCharacters(preset.requiredText)
      : true;

    return {
      ...preset,
      coverageCount,
      order: index,
      sampleText,
      detailText,
      isSupported:
        hasRequiredCoverage &&
        coverageCount > 0 &&
        countPreviewCharacters(sampleText) >= 4,
    };
  })
    .filter((preset) => preset.isSupported)
    .sort((left, right) => {
      if (right.coverageCount !== left.coverageCount) {
        return right.coverageCount - left.coverageCount;
      }

      return left.order - right.order;
    });

  if (scriptMatches.length) {
    const previewRows = scriptMatches.slice(0, 4).map((preset) => ({
      label: preset.label,
      text: preset.sampleText,
      glyphs: buildTextGlyphEntries(preset.sampleText),
    }));
    const primaryPreviewText =
      scriptMatches[0]?.detailText ||
      previewRows[0]?.text ||
      DEFAULT_PREVIEW_TEXT;
    const glyphs = buildScriptMatchGlyphs({
      coverageRanges,
      scriptMatches,
      limit: 36,
    });

    return {
      previewMode: "script-samples",
      primaryPreviewText,
      previewRows,
      glyphs,
      supportedScripts: scriptMatches.map((preset) => preset.label),
      supportedScriptsLabel: formatSupportedScriptsLabel(
        scriptMatches.map((preset) => preset.label),
      ),
      detailPreviewFontSize: getPreviewFontSize(primaryPreviewText),
    };
  }

  const blockMatches = BLOCK_PRESETS.map((preset, index) => ({
    ...preset,
    order: index,
    coverageCount: countCoveredCodePoints(coverageRanges, preset.ranges),
  }))
    .filter((preset) => preset.coverageCount > 0)
    .sort((left, right) => {
      if (right.coverageCount !== left.coverageCount) {
        return right.coverageCount - left.coverageCount;
      }

      return left.order - right.order;
    });

  const dominantTextBlock = blockMatches.find(
    (preset) => preset.kind !== "symbol",
  );
  if (dominantTextBlock) {
    const codePoints = collectSampleCodePoints({
      coverageRanges,
      targetRanges: dominantTextBlock.ranges,
      limit: 12,
    });
    const primaryPreviewText = codePoints
      .map((codePoint) => String.fromCodePoint(codePoint))
      .join("");

    return {
      previewMode: "range-sample",
      primaryPreviewText: primaryPreviewText || DEFAULT_PREVIEW_TEXT,
      previewRows: primaryPreviewText
        ? [
            {
              label: dominantTextBlock.label,
              text: primaryPreviewText,
              glyphs: buildTextGlyphEntries(primaryPreviewText),
            },
          ]
        : [],
      glyphs: buildGlyphEntries(codePoints),
      supportedScripts: [dominantTextBlock.label],
      supportedScriptsLabel: dominantTextBlock.label,
      detailPreviewFontSize: getPreviewFontSize(primaryPreviewText),
    };
  }

  const dominantSymbolBlock = blockMatches[0];
  if (dominantSymbolBlock) {
    const codePoints = collectSampleCodePoints({
      coverageRanges,
      targetRanges: dominantSymbolBlock.ranges,
      limit: 36,
    });
    const glyphs = buildGlyphEntries(codePoints);
    const primaryPreviewText = glyphs
      .slice(0, 6)
      .map((glyph) => glyph.char)
      .join("");

    return {
      previewMode: "symbol-grid",
      primaryPreviewText: primaryPreviewText || DEFAULT_PREVIEW_TEXT,
      previewRows: [],
      glyphs,
      supportedScripts: [dominantSymbolBlock.label],
      supportedScriptsLabel: dominantSymbolBlock.label,
      detailPreviewFontSize: getPreviewFontSize(primaryPreviewText),
    };
  }

  return {
    previewMode: "fallback",
    primaryPreviewText: DEFAULT_PREVIEW_TEXT,
    previewRows: [
      {
        label: "",
        text: DEFAULT_PREVIEW_TEXT,
        glyphs: buildTextGlyphEntries(DEFAULT_PREVIEW_TEXT),
      },
    ],
    glyphs: buildGlyphEntries(
      DEFAULT_PREVIEW_GLYPHS.map((char) => char.codePointAt(0)),
    ),
    supportedScripts: [],
    supportedScriptsLabel: "Unknown",
    detailPreviewFontSize: getPreviewFontSize(DEFAULT_PREVIEW_TEXT),
  };
};

export const createFontInfoExtractor = ({ getFileContent, loadFont }) => {
  const extractFontInfo = async (fontItem) => {
    try {
      const response = await getFileContent(fontItem.fileId);
      if (!response?.url) {
        throw new Error("Could not get font file URL.");
      }

      const fontFace = await loadFont(fontItem.fontFamily, response.url);
      const fontResponse = await fetch(response.url);
      const fontBuffer = await fontResponse.arrayBuffer();
      const fontData = new Uint8Array(fontBuffer);
      const format = detectFontFormat(fontData);
      const { tables, previewNote } = resolveSfntContext(fontData, format);
      const metadata = extractMetadata({ tables, fontFace });
      const coverageRanges = parseCmapCoverageRanges(tables?.cmap?.data);
      const preview = buildCoveragePreview(coverageRanges);

      return {
        itemId: fontItem.id,
        fontFamily: fontItem.fontFamily,
        fileId: fontItem.fileId,
        fileName: fontItem.name || `${fontItem.fontFamily}.ttf`,
        fileSize: `${Math.round(fontBuffer.byteLength / 1024)} KB`,
        format,
        weightClass: metadata.weightClass,
        isVariableFont: metadata.isVariableFont ? "Yes" : "No",
        supportsItalics: metadata.supportsItalics ? "Yes" : "No",
        glyphCount: metadata.glyphCount,
        languageSupport: preview.supportedScriptsLabel,
        supportedScripts: preview.supportedScripts,
        previewMode: preview.previewMode,
        primaryPreviewText: preview.primaryPreviewText,
        previewRows: preview.previewRows,
        glyphs: preview.glyphs,
        detailPreviewFontSize: preview.detailPreviewFontSize,
        previewNote,
      };
    } catch (error) {
      return {
        itemId: fontItem.id,
        fontFamily: fontItem.fontFamily,
        fileId: fontItem.fileId,
        fileName: fontItem.name || `${fontItem.fontFamily}.ttf`,
        fileSize: "0 KB",
        format: "Unknown",
        weightClass: "Unknown",
        isVariableFont: "Unknown",
        supportsItalics: "Unknown",
        glyphCount: 0,
        languageSupport: "Unknown",
        supportedScripts: [],
        previewMode: "fallback",
        primaryPreviewText: DEFAULT_PREVIEW_TEXT,
        previewRows: [
          {
            label: "",
            text: DEFAULT_PREVIEW_TEXT,
            glyphs: buildTextGlyphEntries(DEFAULT_PREVIEW_TEXT),
          },
        ],
        glyphs: buildGlyphEntries(
          DEFAULT_PREVIEW_GLYPHS.map((char) => char.codePointAt(0)),
        ),
        detailPreviewFontSize: getPreviewFontSize(DEFAULT_PREVIEW_TEXT),
        error: error.message,
      };
    }
  };

  return {
    extractFontInfo,
  };
};
