use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{ExtendedColorType, ImageEncoder, ImageFormat};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sprite_dicing::{dice, Pivot, Pixel, Prefs, SourceSprite, Texture};
use std::collections::{BTreeMap, BTreeSet};
use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{BufWriter, Seek, Write};
use std::path::{Path, PathBuf};
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipWriter};

const BUNDLE_VERSION: u8 = 4;
const BUNDLE_HEADER_SIZE: usize = 16;
const DICING_ELIGIBLE_MIME_TYPES: [&str; 3] = ["image/png", "image/jpeg", "image/webp"];
const DICING_UNIT_SIZE: u32 = 64;
const DICING_PADDING: u32 = 0;
const DICING_ATLAS_SIZE_LIMIT: u32 = 2048;
const DICING_MIN_GROUP_SIZE: usize = 2;
const DICING_OUTPUT_MIME: &str = "image/png";
const DICING_MAX_IMAGE_PIXELS: u64 = 1_500_000;
const DICING_MAX_GROUP_TOTAL_PIXELS: u64 = 12_000_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZipAssetInput {
    pub id: String,
    pub path: String,
    pub mime: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZipExportStats {
    pub raw_asset_bytes: u64,
    pub asset_count: usize,
    pub package_bin_bytes: u64,
    pub zip_bytes: u64,
    pub unique_chunk_count: usize,
    pub chunk_reference_count: usize,
    pub stored_chunk_bytes: u64,
    pub deduped_bytes: u64,
    pub diced_asset_count: usize,
    pub atlas_count: usize,
    pub image_optimized_bytes_saved: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BundleChunking {
    algorithm: &'static str,
    mode: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BundleImageOptimization {
    algorithm: &'static str,
    eligible_mime_types: Vec<&'static str>,
    grouping: &'static str,
    unit_size: u32,
    padding: u32,
    trim_transparent: bool,
    atlas_size_limit: u32,
    ppu: f32,
    pivot: BundlePoint,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BundleChunkMeta {
    start: u64,
    length: u64,
    sha256: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BundleChunkedEntryMeta {
    mime: String,
    size: u64,
    chunks: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BundlePoint {
    x: f32,
    y: f32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BundleUv {
    u: f32,
    v: f32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BundleRect {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "encoding", rename_all = "camelCase")]
enum BundleAssetMeta {
    Raw {
        mime: String,
        size: u64,
        chunks: Vec<String>,
    },
    #[serde(rename = "diced-image")]
    DicedImage {
        mime: String,
        size: u64,
        width: u32,
        height: u32,
        #[serde(rename = "atlasId")]
        atlas_id: String,
        vertices: Vec<BundlePoint>,
        uvs: Vec<BundleUv>,
        indices: Vec<usize>,
        rect: BundleRect,
        pivot: BundlePoint,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BundleManifest {
    chunking: BundleChunking,
    image_optimization: BundleImageOptimization,
    chunks: BTreeMap<String, BundleChunkMeta>,
    assets: BTreeMap<String, BundleAssetMeta>,
    atlases: BTreeMap<String, BundleChunkedEntryMeta>,
    instructions: BundleChunkedEntryMeta,
}

#[derive(Debug)]
struct PackageBinStats {
    raw_asset_bytes: u64,
    package_bin_bytes: u64,
    unique_chunk_count: usize,
    chunk_reference_count: usize,
    stored_chunk_bytes: u64,
    deduped_bytes: u64,
    diced_asset_count: usize,
    atlas_count: usize,
    image_optimized_bytes_saved: u64,
}

#[derive(Debug)]
struct LoadedAsset {
    id: String,
    mime: String,
    bytes: Vec<u8>,
    decoded_image: Option<DecodedImageAsset>,
}

#[derive(Debug, Clone)]
struct DecodedImageAsset {
    width: u32,
    height: u32,
    texture: Texture,
}

#[derive(Debug)]
struct DicedGroupCandidate {
    asset_entries: BTreeMap<String, BundleAssetMeta>,
    atlas_entries: BTreeMap<String, BundleChunkedEntryMeta>,
    chunk_payloads: BTreeMap<String, Vec<u8>>,
    chunk_reference_count: usize,
    source_bytes: u64,
    approx_bundle_bytes: u64,
}

fn decoded_image_pixel_count(decoded_image: &DecodedImageAsset) -> u64 {
    decoded_image.width as u64 * decoded_image.height as u64
}

fn is_decoded_image_eligible_for_dicing(decoded_image: &DecodedImageAsset) -> bool {
    decoded_image_pixel_count(decoded_image) <= DICING_MAX_IMAGE_PIXELS
}

fn make_part_path(path: &Path) -> PathBuf {
    let mut part_path: OsString = path.as_os_str().to_os_string();
    part_path.push(".part");
    PathBuf::from(part_path)
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join("")
}

fn hash_chunk_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    bytes_to_hex(&hasher.finalize())
}

fn has_png_signature(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a])
}

fn has_jpeg_signature(bytes: &[u8]) -> bool {
    bytes.len() >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff
}

fn has_webp_signature(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP"
}

fn is_font_mime(mime: &str) -> bool {
    mime.starts_with("font/")
        || mime.starts_with("application/font")
        || mime.starts_with("application/x-font")
}

fn normalize_font_mime(mime: &str) -> Option<&'static str> {
    match mime {
        "font/ttf"
        | "application/font-sfnt"
        | "application/x-font-truetype"
        | "application/x-truetype-font"
        | "font/sfnt" => Some("font/ttf"),
        "font/otf" => Some("font/otf"),
        "font/woff" | "application/font-woff" | "application/x-font-woff" => Some("font/woff"),
        "font/woff2" => Some("font/woff2"),
        "font/ttc" => Some("font/ttc"),
        "font/eot" | "application/vnd.ms-fontobject" | "application/x-font-eot" => Some("font/eot"),
        _ => None,
    }
}

fn detect_font_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() < 4 {
        return None;
    }

    if bytes.starts_with(&[0x00, 0x01, 0x00, 0x00]) || bytes.starts_with(b"true") {
        return Some("font/ttf");
    }

    if bytes.starts_with(b"OTTO") {
        return Some("font/otf");
    }

    if bytes.starts_with(b"wOFF") {
        return Some("font/woff");
    }

    if bytes.starts_with(b"wOF2") {
        return Some("font/woff2");
    }

    if bytes.starts_with(b"ttcf") {
        return Some("font/ttc");
    }

    if bytes.starts_with(&[0x02, 0x00, 0x01, 0x00])
        || bytes.starts_with(&[0x01, 0x00, 0x02, 0x00])
        || bytes.starts_with(&[0x00, 0x01, 0x00, 0x02])
    {
        return Some("font/eot");
    }

    None
}

fn normalize_asset_mime(mime: Option<&str>, bytes: &[u8]) -> String {
    let normalized = mime
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "application/octet-stream".to_string());

    if let Some(font_mime) = normalize_font_mime(&normalized) {
        return font_mime.to_string();
    }

    if normalized == "application/octet-stream" || is_font_mime(&normalized) {
        if let Some(font_mime) = detect_font_mime(bytes) {
            return font_mime.to_string();
        }
    }

    normalized
}

fn detect_dicing_image_format(mime: &str, bytes: &[u8]) -> Option<ImageFormat> {
    match mime {
        "image/png" => Some(ImageFormat::Png),
        "image/jpeg" | "image/jpg" => Some(ImageFormat::Jpeg),
        "image/webp" => Some(ImageFormat::WebP),
        _ if has_png_signature(bytes) => Some(ImageFormat::Png),
        _ if has_jpeg_signature(bytes) => Some(ImageFormat::Jpeg),
        _ if has_webp_signature(bytes) => Some(ImageFormat::WebP),
        _ => None,
    }
}

fn register_chunked_entry(
    bytes: &[u8],
    mime: String,
    chunk_payloads: &mut BTreeMap<String, Vec<u8>>,
    chunk_reference_count: &mut usize,
) -> BundleChunkedEntryMeta {
    let chunk_id = hash_chunk_bytes(bytes);
    chunk_payloads
        .entry(chunk_id.clone())
        .or_insert_with(|| bytes.to_vec());
    *chunk_reference_count += 1;

    BundleChunkedEntryMeta {
        mime,
        size: bytes.len() as u64,
        chunks: vec![chunk_id],
    }
}

fn raw_asset_meta_from_entry(entry: BundleChunkedEntryMeta) -> BundleAssetMeta {
    BundleAssetMeta::Raw {
        mime: entry.mime,
        size: entry.size,
        chunks: entry.chunks,
    }
}

fn decode_dicing_asset(
    bytes: &[u8],
    image_format: ImageFormat,
) -> Result<DecodedImageAsset, String> {
    let image = image::load_from_memory_with_format(bytes, image_format)
        .map_err(|e| format!("Failed to decode {:?} asset for dicing: {e}", image_format))?;
    let rgba = image.to_rgba8();
    let pixels = rgba
        .pixels()
        .map(|pixel| Pixel::from_raw(pixel.0))
        .collect::<Vec<_>>();

    Ok(DecodedImageAsset {
        width: rgba.width(),
        height: rgba.height(),
        texture: Texture {
            width: rgba.width(),
            height: rgba.height(),
            pixels,
        },
    })
}

fn encode_texture_as_png(texture: &Texture) -> Result<Vec<u8>, String> {
    let mut encoded = Vec::new();
    let raw = texture
        .pixels
        .iter()
        .flat_map(|pixel| pixel.to_raw())
        .collect::<Vec<_>>();
    let encoder =
        PngEncoder::new_with_quality(&mut encoded, CompressionType::Best, FilterType::Adaptive);

    encoder
        .write_image(
            &raw,
            texture.width,
            texture.height,
            ExtendedColorType::Rgba8,
        )
        .map_err(|e| format!("Failed to encode diced atlas as PNG: {e}"))?;

    Ok(encoded)
}

fn build_dicing_prefs() -> Prefs {
    Prefs {
        unit_size: DICING_UNIT_SIZE,
        padding: DICING_PADDING,
        uv_inset: 0.0,
        trim_transparent: false,
        atlas_size_limit: DICING_ATLAS_SIZE_LIMIT,
        atlas_square: false,
        atlas_pot: false,
        ppu: 1.0,
        pivot: Pivot::new(0.0, 0.0),
        on_progress: None,
    }
}

fn build_diced_group_candidate(
    group_id: usize,
    assets: &[&LoadedAsset],
) -> Result<Option<DicedGroupCandidate>, String> {
    if assets.len() < DICING_MIN_GROUP_SIZE {
        return Ok(None);
    }

    let group_total_pixels = assets
        .iter()
        .filter_map(|asset| asset.decoded_image.as_ref())
        .map(decoded_image_pixel_count)
        .sum::<u64>();
    if group_total_pixels > DICING_MAX_GROUP_TOTAL_PIXELS {
        return Ok(None);
    }

    let prefs = build_dicing_prefs();
    let source_sprites = assets
        .iter()
        .map(|asset| {
            let decoded_image = asset
                .decoded_image
                .as_ref()
                .ok_or_else(|| format!("Missing decoded source image for asset {}", asset.id))?;
            Ok(SourceSprite {
                id: asset.id.clone(),
                texture: decoded_image.texture.clone(),
                pivot: None,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let artifacts = dice(&source_sprites, &prefs)
        .map_err(|e| format!("Failed to dice PNG asset group {group_id}: {e}"))?;
    let source_bytes = assets
        .iter()
        .map(|asset| asset.bytes.len() as u64)
        .sum::<u64>();

    if artifacts.atlases.is_empty() || artifacts.sprites.is_empty() {
        return Ok(None);
    }

    let mut chunk_payloads = BTreeMap::new();
    let mut chunk_reference_count = 0usize;
    let mut atlas_entries = BTreeMap::new();
    let mut atlas_ids = Vec::new();

    for (atlas_index, atlas_texture) in artifacts.atlases.iter().enumerate() {
        let atlas_id = format!("diced-atlas-{group_id}-{atlas_index}");
        let atlas_png = encode_texture_as_png(atlas_texture)?;
        let atlas_entry = register_chunked_entry(
            &atlas_png,
            DICING_OUTPUT_MIME.to_string(),
            &mut chunk_payloads,
            &mut chunk_reference_count,
        );
        atlas_entries.insert(atlas_id.clone(), atlas_entry);
        atlas_ids.push(atlas_id);
    }

    let source_asset_by_id = assets
        .iter()
        .map(|asset| (asset.id.as_str(), *asset))
        .collect::<BTreeMap<_, _>>();
    let mut asset_entries = BTreeMap::new();

    for sprite in &artifacts.sprites {
        let source_asset = source_asset_by_id
            .get(sprite.id.as_str())
            .copied()
            .ok_or_else(|| format!("Missing diced source asset metadata for {}", sprite.id))?;
        let decoded_image = source_asset
            .decoded_image
            .as_ref()
            .ok_or_else(|| format!("Missing decoded source image for diced asset {}", sprite.id))?;
        let atlas_id = atlas_ids
            .get(sprite.atlas_index)
            .cloned()
            .ok_or_else(|| format!("Missing atlas entry for diced asset {}", sprite.id))?;
        let vertices = sprite
            .vertices
            .iter()
            .map(|vertex| BundlePoint {
                x: vertex.x,
                y: vertex.y,
            })
            .collect::<Vec<_>>();
        let uvs = sprite
            .uvs
            .iter()
            .map(|uv| BundleUv { u: uv.u, v: uv.v })
            .collect::<Vec<_>>();

        asset_entries.insert(
            sprite.id.clone(),
            BundleAssetMeta::DicedImage {
                mime: source_asset.mime.clone(),
                size: source_asset.bytes.len() as u64,
                width: decoded_image.width,
                height: decoded_image.height,
                atlas_id,
                vertices,
                uvs,
                indices: sprite.indices.clone(),
                rect: BundleRect {
                    x: sprite.rect.x,
                    y: sprite.rect.y,
                    width: sprite.rect.width,
                    height: sprite.rect.height,
                },
                pivot: BundlePoint {
                    x: sprite.pivot.x,
                    y: sprite.pivot.y,
                },
            },
        );
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct GroupManifestPreview<'a> {
        assets: &'a BTreeMap<String, BundleAssetMeta>,
        atlases: &'a BTreeMap<String, BundleChunkedEntryMeta>,
    }

    let stored_chunk_bytes = chunk_payloads
        .values()
        .map(|chunk_bytes| chunk_bytes.len() as u64)
        .sum::<u64>();
    let approx_metadata_bytes = serde_json::to_vec(&GroupManifestPreview {
        assets: &asset_entries,
        atlases: &atlas_entries,
    })
    .map_err(|e| format!("Failed to serialize diced group preview: {e}"))?
    .len() as u64;
    let approx_bundle_bytes = stored_chunk_bytes + approx_metadata_bytes;

    if approx_bundle_bytes >= source_bytes {
        return Ok(None);
    }

    Ok(Some(DicedGroupCandidate {
        asset_entries,
        atlas_entries,
        chunk_payloads,
        chunk_reference_count,
        source_bytes,
        approx_bundle_bytes,
    }))
}

fn build_bundle_manifest(
    assets: &[ZipAssetInput],
    instructions_json: &str,
) -> Result<(Vec<u8>, BTreeMap<String, Vec<u8>>, PackageBinStats), String> {
    let mut loaded_assets = Vec::new();
    let mut raw_asset_bytes = 0u64;
    let mut diced_group_indices = BTreeMap::new();

    for asset in assets {
        let bytes = fs::read(&asset.path)
            .map_err(|e| format!("Failed to read asset {} at {}: {e}", asset.id, asset.path))?;
        let mime = normalize_asset_mime(asset.mime.as_deref(), &bytes);
        let decoded_image = detect_dicing_image_format(&mime, &bytes)
            .and_then(|image_format| decode_dicing_asset(&bytes, image_format).ok());

        raw_asset_bytes += bytes.len() as u64;
        let loaded_asset = LoadedAsset {
            id: asset.id.clone(),
            mime,
            bytes,
            decoded_image,
        };

        if let Some(decoded_image) = loaded_asset.decoded_image.as_ref() {
            if is_decoded_image_eligible_for_dicing(decoded_image) {
                diced_group_indices
                    .entry((decoded_image.width, decoded_image.height))
                    .or_insert_with(Vec::new)
                    .push(loaded_assets.len());
            }
        }

        loaded_assets.push(loaded_asset);
    }

    let mut chunk_payloads = BTreeMap::new();
    let mut asset_entries = BTreeMap::new();
    let mut atlas_entries = BTreeMap::new();
    let mut chunk_reference_count = 0usize;
    let mut diced_asset_ids = BTreeSet::new();
    let mut diced_asset_count = 0usize;
    let mut atlas_count = 0usize;
    let mut image_optimized_bytes_saved = 0u64;
    let mut next_group_id = 0usize;

    for group_indices in diced_group_indices.values() {
        let group_assets = group_indices
            .iter()
            .filter_map(|index| loaded_assets.get(*index))
            .collect::<Vec<_>>();
        let candidate = build_diced_group_candidate(next_group_id, &group_assets)?;
        next_group_id += 1;

        let Some(candidate) = candidate else {
            continue;
        };

        for (chunk_id, chunk_bytes) in candidate.chunk_payloads {
            chunk_payloads.entry(chunk_id).or_insert(chunk_bytes);
        }

        for (asset_id, entry) in candidate.asset_entries {
            diced_asset_ids.insert(asset_id.clone());
            asset_entries.insert(asset_id, entry);
            diced_asset_count += 1;
        }

        for (atlas_id, entry) in candidate.atlas_entries {
            atlas_entries.insert(atlas_id, entry);
            atlas_count += 1;
        }

        chunk_reference_count += candidate.chunk_reference_count;
        image_optimized_bytes_saved += candidate
            .source_bytes
            .saturating_sub(candidate.approx_bundle_bytes);
    }

    for asset in &loaded_assets {
        if diced_asset_ids.contains(&asset.id) {
            continue;
        }

        let entry = register_chunked_entry(
            &asset.bytes,
            asset.mime.clone(),
            &mut chunk_payloads,
            &mut chunk_reference_count,
        );
        asset_entries.insert(asset.id.clone(), raw_asset_meta_from_entry(entry));
    }

    let instructions_entry = register_chunked_entry(
        instructions_json.as_bytes(),
        "application/json".to_string(),
        &mut chunk_payloads,
        &mut chunk_reference_count,
    );

    let mut stored_chunk_bytes = 0u64;
    let mut chunks = BTreeMap::new();
    for (chunk_id, chunk_bytes) in &chunk_payloads {
        chunks.insert(
            chunk_id.clone(),
            BundleChunkMeta {
                start: stored_chunk_bytes,
                length: chunk_bytes.len() as u64,
                sha256: chunk_id.clone(),
            },
        );
        stored_chunk_bytes += chunk_bytes.len() as u64;
    }

    let manifest = BundleManifest {
        chunking: BundleChunking {
            algorithm: "none",
            mode: "whole-file-only",
        },
        image_optimization: BundleImageOptimization {
            algorithm: "sprite-dicing",
            eligible_mime_types: DICING_ELIGIBLE_MIME_TYPES.to_vec(),
            grouping: "decoded-image-dimensions",
            unit_size: DICING_UNIT_SIZE,
            padding: DICING_PADDING,
            trim_transparent: false,
            atlas_size_limit: DICING_ATLAS_SIZE_LIMIT,
            ppu: 1.0,
            pivot: BundlePoint { x: 0.0, y: 0.0 },
        },
        chunks,
        assets: asset_entries,
        atlases: atlas_entries,
        instructions: instructions_entry,
    };
    let manifest_bytes = serde_json::to_vec(&manifest)
        .map_err(|e| format!("Failed to serialize bundle manifest: {e}"))?;
    let source_bytes = raw_asset_bytes + instructions_json.as_bytes().len() as u64;
    let deduped_bytes = source_bytes.saturating_sub(stored_chunk_bytes);

    Ok((
        manifest_bytes,
        chunk_payloads,
        PackageBinStats {
            raw_asset_bytes,
            package_bin_bytes: 0,
            unique_chunk_count: manifest.chunks.len(),
            chunk_reference_count,
            stored_chunk_bytes,
            deduped_bytes,
            diced_asset_count,
            atlas_count,
            image_optimized_bytes_saved,
        },
    ))
}

fn write_package_bin_entry<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    assets: &[ZipAssetInput],
    instructions_json: &str,
) -> Result<PackageBinStats, String> {
    let (manifest_bytes, chunk_payloads, mut stats) =
        build_bundle_manifest(assets, instructions_json)?;

    if manifest_bytes.len() > u32::MAX as usize {
        return Err("Bundle manifest is too large (> 4GB)".to_string());
    }

    let header = {
        let mut bytes = [0u8; BUNDLE_HEADER_SIZE];
        bytes[0] = BUNDLE_VERSION;
        bytes[1..5].copy_from_slice(&(manifest_bytes.len() as u32).to_be_bytes());
        bytes
    };

    zip.write_all(&header)
        .map_err(|e| format!("Failed to write bundle header: {e}"))?;
    zip.write_all(&manifest_bytes)
        .map_err(|e| format!("Failed to write bundle manifest: {e}"))?;

    for chunk_bytes in chunk_payloads.values() {
        zip.write_all(chunk_bytes)
            .map_err(|e| format!("Failed to write bundle chunk payload: {e}"))?;
    }

    stats.package_bin_bytes =
        BUNDLE_HEADER_SIZE as u64 + manifest_bytes.len() as u64 + stats.stored_chunk_bytes;

    Ok(stats)
}

fn write_distribution_zip(
    work_path: &Path,
    assets: &[ZipAssetInput],
    instructions_json: &str,
    index_html: Option<&str>,
    main_js: Option<&str>,
) -> Result<ZipExportStats, String> {
    let file = File::create(work_path)
        .map_err(|e| format!("Failed to create zip file {}: {e}", work_path.display()))?;
    let writer = BufWriter::new(file);
    let mut zip = ZipWriter::new(writer);
    let options = FileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .large_file(true);

    zip.start_file("package.bin", options)
        .map_err(|e| format!("Failed to create package.bin zip entry: {e}"))?;
    let package_stats = write_package_bin_entry(&mut zip, assets, instructions_json)?;

    if let Some(index_html) = index_html {
        zip.start_file("index.html", options)
            .map_err(|e| format!("Failed to create index.html zip entry: {e}"))?;
        zip.write_all(index_html.as_bytes())
            .map_err(|e| format!("Failed to write index.html content: {e}"))?;
    }

    if let Some(main_js) = main_js {
        zip.start_file("main.js", options)
            .map_err(|e| format!("Failed to create main.js zip entry: {e}"))?;
        zip.write_all(main_js.as_bytes())
            .map_err(|e| format!("Failed to write main.js content: {e}"))?;
    }

    let mut writer = zip
        .finish()
        .map_err(|e| format!("Failed to finalize zip: {e}"))?;
    writer
        .flush()
        .map_err(|e| format!("Failed to flush finalized zip: {e}"))?;
    drop(writer);

    let zip_bytes = fs::metadata(work_path)
        .map_err(|e| format!("Failed to read zip metadata {}: {e}", work_path.display()))?
        .len();

    Ok(ZipExportStats {
        raw_asset_bytes: package_stats.raw_asset_bytes,
        asset_count: assets.len(),
        package_bin_bytes: package_stats.package_bin_bytes,
        zip_bytes,
        unique_chunk_count: package_stats.unique_chunk_count,
        chunk_reference_count: package_stats.chunk_reference_count,
        stored_chunk_bytes: package_stats.stored_chunk_bytes,
        deduped_bytes: package_stats.deduped_bytes,
        diced_asset_count: package_stats.diced_asset_count,
        atlas_count: package_stats.atlas_count,
        image_optimized_bytes_saved: package_stats.image_optimized_bytes_saved,
    })
}

fn create_distribution_zip_streamed_sync(
    output_path: String,
    assets: Vec<ZipAssetInput>,
    instructions_json: String,
    index_html: Option<String>,
    main_js: Option<String>,
    use_part_file: bool,
) -> Result<ZipExportStats, String> {
    let final_path = PathBuf::from(output_path);
    let work_path = if use_part_file {
        make_part_path(&final_path)
    } else {
        final_path.clone()
    };

    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to ensure output directory {} exists: {e}",
                parent.display()
            )
        })?;
    }

    let write_result = write_distribution_zip(
        &work_path,
        &assets,
        &instructions_json,
        index_html.as_deref(),
        main_js.as_deref(),
    );

    let stats = match write_result {
        Ok(stats) => stats,
        Err(error) => {
            if use_part_file {
                let _ = fs::remove_file(&work_path);
            }
            return Err(error);
        }
    };

    if use_part_file {
        if final_path.exists() {
            fs::remove_file(&final_path).map_err(|e| {
                format!(
                    "Failed to remove existing output file {}: {e}",
                    final_path.display()
                )
            })?;
        }

        fs::rename(&work_path, &final_path).map_err(|e| {
            format!(
                "Failed to move temporary zip {} to final destination {}: {e}",
                work_path.display(),
                final_path.display()
            )
        })?;
    }

    Ok(stats)
}

#[tauri::command]
pub async fn create_distribution_zip_streamed(
    output_path: String,
    assets: Vec<ZipAssetInput>,
    instructions_json: String,
    index_html: Option<String>,
    main_js: Option<String>,
    use_part_file: Option<bool>,
) -> Result<ZipExportStats, String> {
    let use_part_file = use_part_file.unwrap_or(true);

    tauri::async_runtime::spawn_blocking(move || {
        create_distribution_zip_streamed_sync(
            output_path,
            assets,
            instructions_json,
            index_html,
            main_js,
            use_part_file,
        )
    })
    .await
    .map_err(|e| format!("Failed to run zip export task: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::codecs::jpeg::JpegEncoder;
    use image::{DynamicImage, ImageBuffer, Rgba};
    use serde_json::Value;
    use std::io::Read;
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::ZipArchive;

    fn create_unique_test_dir() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("routevn-export-zip-test-{unique}"));
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    fn parse_bundle_manifest(bundle_bytes: &[u8]) -> (u8, Value) {
        let version = bundle_bytes[0];
        let manifest_len = u32::from_be_bytes([
            bundle_bytes[1],
            bundle_bytes[2],
            bundle_bytes[3],
            bundle_bytes[4],
        ]) as usize;
        let manifest_start = BUNDLE_HEADER_SIZE;
        let manifest_end = manifest_start + manifest_len;
        let manifest = serde_json::from_slice::<Value>(&bundle_bytes[manifest_start..manifest_end])
            .expect("parse bundle manifest json");

        (version, manifest)
    }

    fn build_sprite_fixture_image(
        accent_color: [u8; 4],
        accent_x: u32,
        accent_y: u32,
    ) -> DynamicImage {
        let width = 256u32;
        let height = 256u32;
        let mut image = ImageBuffer::from_pixel(width, height, Rgba([24, 32, 48, 255]));

        for y in 0..height {
            for x in 0..width {
                let noise = (((x * 31) ^ (y * 17) ^ ((x * y) % 251)) % 255) as u8;
                image.put_pixel(
                    x,
                    y,
                    Rgba([noise, noise.wrapping_add(37), noise.wrapping_add(91), 255]),
                );
            }
        }

        for y in 24..232 {
            for x in 20..236 {
                if (x + y) % 7 == 0 {
                    image.put_pixel(x, y, Rgba([240, 240, 240, 255]));
                }
            }
        }

        for y in accent_y..(accent_y + 40) {
            for x in accent_x..(accent_x + 40) {
                image.put_pixel(x, y, Rgba(accent_color));
            }
        }

        DynamicImage::ImageRgba8(image)
    }

    fn write_fixture_in_format(
        path: &Path,
        image_format: ImageFormat,
        accent_color: [u8; 4],
        accent_x: u32,
        accent_y: u32,
    ) {
        let image = build_sprite_fixture_image(accent_color, accent_x, accent_y);

        if image_format == ImageFormat::Jpeg {
            let rgb = image.to_rgb8();
            let file = File::create(path).expect("create jpeg fixture");
            let mut encoder = JpegEncoder::new_with_quality(file, 100);
            encoder
                .encode(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .expect("encode jpeg fixture");
            return;
        }

        image
            .save_with_format(path, image_format)
            .expect("save fixture image");
    }

    fn write_large_png_fixture(path: &Path, width: u32, height: u32, accent_color: [u8; 4]) {
        let mut image = ImageBuffer::from_pixel(width, height, Rgba([18, 24, 36, 255]));

        for y in 0..height {
            for x in 0..width {
                let noise = (((x * 17) ^ (y * 29) ^ ((x + y) % 251)) % 255) as u8;
                image.put_pixel(
                    x,
                    y,
                    Rgba([noise, noise.wrapping_add(41), noise.wrapping_add(83), 255]),
                );
            }
        }

        for y in (height / 4)..(height / 4 + 96) {
            for x in (width / 4)..(width / 4 + 96) {
                image.put_pixel(x, y, Rgba(accent_color));
            }
        }

        DynamicImage::ImageRgba8(image)
            .save_with_format(path, ImageFormat::Png)
            .expect("save large png fixture");
    }

    fn assert_diced_image_export_for_format(
        extension: &str,
        mime: &str,
        image_format: ImageFormat,
    ) {
        let test_dir = create_unique_test_dir();
        let sprite_a_path = test_dir.join(format!("sprite-a.{extension}"));
        let sprite_b_path = test_dir.join(format!("sprite-b.{extension}"));
        let output_path = test_dir.join("export.zip");

        write_fixture_in_format(&sprite_a_path, image_format, [255, 96, 96, 255], 36, 52);
        write_fixture_in_format(&sprite_b_path, image_format, [96, 160, 255, 255], 44, 52);

        let stats = create_distribution_zip_streamed_sync(
            output_path.display().to_string(),
            vec![
                ZipAssetInput {
                    id: "sprite-a".to_string(),
                    path: sprite_a_path.display().to_string(),
                    mime: Some(mime.to_string()),
                },
                ZipAssetInput {
                    id: "sprite-b".to_string(),
                    path: sprite_b_path.display().to_string(),
                    mime: Some(mime.to_string()),
                },
            ],
            r#"{"projectData":{"story":{"initialSceneId":"scene-1","scenes":{"scene-1":{"initialSectionId":"section-1","sections":{"section-1":{"lines":[]}}}}}}}"#
                .to_string(),
            Some("<!doctype html><html></html>".to_string()),
            Some("console.log('bundle');".to_string()),
            false,
        )
        .expect("streamed zip export should succeed");

        assert_eq!(stats.asset_count, 2);
        assert_eq!(stats.diced_asset_count, 2);
        assert!(stats.atlas_count >= 1);
        assert!(stats.image_optimized_bytes_saved > 0);

        let zip_file = File::open(&output_path).expect("open output zip");
        let mut archive = ZipArchive::new(zip_file).expect("open zip archive");
        let mut package_bin = Vec::new();
        archive
            .by_name("package.bin")
            .expect("package.bin entry")
            .read_to_end(&mut package_bin)
            .expect("read package.bin");

        let (version, manifest) = parse_bundle_manifest(&package_bin);
        assert_eq!(version, BUNDLE_VERSION);
        assert_eq!(
            manifest["assets"]["sprite-a"]["encoding"],
            Value::String("diced-image".to_string())
        );
        assert_eq!(
            manifest["assets"]["sprite-a"]["atlasId"],
            Value::String("diced-atlas-0-0".to_string())
        );
        assert_eq!(
            manifest["assets"]["sprite-a"]["mime"],
            Value::String(mime.to_string())
        );
        assert_eq!(
            manifest["assets"]["sprite-b"]["encoding"],
            Value::String("diced-image".to_string())
        );
        assert!(
            manifest["assets"]["sprite-a"]["indices"]
                .as_array()
                .expect("indices")
                .len()
                >= 6
        );
        assert!(manifest["atlases"]
            .as_object()
            .expect("atlas map")
            .contains_key("diced-atlas-0-0"));

        fs::remove_dir_all(test_dir).expect("remove temp test dir");
    }

    #[test]
    fn streamed_zip_export_dedupes_identical_raw_files() {
        let test_dir = create_unique_test_dir();
        let asset_a_path = test_dir.join("file-a.bin");
        let asset_b_path = test_dir.join("file-b.bin");
        let output_path = test_dir.join("export.zip");
        let asset_bytes = vec![0x5a; 64 * 1024];

        fs::write(&asset_a_path, &asset_bytes).expect("write asset a");
        fs::write(&asset_b_path, &asset_bytes).expect("write asset b");

        let stats = create_distribution_zip_streamed_sync(
            output_path.display().to_string(),
            vec![
                ZipAssetInput {
                    id: "file-a".to_string(),
                    path: asset_a_path.display().to_string(),
                    mime: Some("application/octet-stream".to_string()),
                },
                ZipAssetInput {
                    id: "file-b".to_string(),
                    path: asset_b_path.display().to_string(),
                    mime: Some("application/octet-stream".to_string()),
                },
            ],
            r#"{"projectData":{"story":{"initialSceneId":"scene-1","scenes":{"scene-1":{"initialSectionId":"section-1","sections":{"section-1":{"lines":[]}}}}}}}"#
                .to_string(),
            Some("<!doctype html><html></html>".to_string()),
            Some("console.log('bundle');".to_string()),
            false,
        )
        .expect("streamed zip export should succeed");

        assert_eq!(stats.asset_count, 2);
        assert_eq!(stats.raw_asset_bytes, (asset_bytes.len() * 2) as u64);
        assert!(stats.package_bin_bytes > 0);
        assert_eq!(stats.unique_chunk_count, 2);
        assert_eq!(stats.chunk_reference_count, 3);
        assert!(stats.deduped_bytes >= asset_bytes.len() as u64);
        assert_eq!(
            stats.zip_bytes,
            fs::metadata(&output_path).expect("zip metadata").len()
        );

        let zip_file = File::open(&output_path).expect("open output zip");
        let mut archive = ZipArchive::new(zip_file).expect("open zip archive");
        let mut package_bin = Vec::new();
        archive
            .by_name("package.bin")
            .expect("package.bin entry")
            .read_to_end(&mut package_bin)
            .expect("read package.bin");

        let (version, manifest) = parse_bundle_manifest(&package_bin);
        assert_eq!(version, BUNDLE_VERSION);
        let file_a_chunks = manifest["assets"]["file-a"]["chunks"]
            .as_array()
            .expect("file-a chunks array");
        let file_b_chunks = manifest["assets"]["file-b"]["chunks"]
            .as_array()
            .expect("file-b chunks array");
        assert_eq!(file_a_chunks, file_b_chunks);
        assert_eq!(file_a_chunks.len(), 1);
        assert_eq!(manifest["chunking"]["mode"], "whole-file-only");

        fs::remove_dir_all(test_dir).expect("remove temp test dir");
    }

    #[test]
    fn streamed_zip_export_dices_png_groups_when_they_are_smaller_than_raw_sources() {
        assert_diced_image_export_for_format("png", "image/png", ImageFormat::Png);
    }

    #[test]
    fn streamed_zip_export_dices_jpeg_groups_when_they_are_smaller_than_raw_sources() {
        assert_diced_image_export_for_format("jpg", "image/jpeg", ImageFormat::Jpeg);
    }

    #[test]
    fn streamed_zip_export_dices_webp_groups_when_they_are_smaller_than_raw_sources() {
        assert_diced_image_export_for_format("webp", "image/webp", ImageFormat::WebP);
    }

    #[test]
    fn streamed_zip_export_skips_dicing_for_oversized_fullscreen_groups() {
        let test_dir = create_unique_test_dir();
        let sprite_a_path = test_dir.join("large-a.png");
        let sprite_b_path = test_dir.join("large-b.png");
        let output_path = test_dir.join("export.zip");

        write_large_png_fixture(&sprite_a_path, 1600, 1000, [255, 96, 96, 255]);
        write_large_png_fixture(&sprite_b_path, 1600, 1000, [96, 160, 255, 255]);

        let stats = create_distribution_zip_streamed_sync(
            output_path.display().to_string(),
            vec![
                ZipAssetInput {
                    id: "large-a".to_string(),
                    path: sprite_a_path.display().to_string(),
                    mime: Some("image/png".to_string()),
                },
                ZipAssetInput {
                    id: "large-b".to_string(),
                    path: sprite_b_path.display().to_string(),
                    mime: Some("image/png".to_string()),
                },
            ],
            r#"{"projectData":{"story":{"initialSceneId":"scene-1","scenes":{"scene-1":{"initialSectionId":"section-1","sections":{"section-1":{"lines":[]}}}}}}}"#
                .to_string(),
            Some("<!doctype html><html></html>".to_string()),
            Some("console.log('bundle');".to_string()),
            false,
        )
        .expect("streamed zip export should succeed");

        assert_eq!(stats.diced_asset_count, 0);
        assert_eq!(stats.atlas_count, 0);

        let zip_file = File::open(&output_path).expect("open output zip");
        let mut archive = ZipArchive::new(zip_file).expect("open zip archive");
        let mut package_bin = Vec::new();
        archive
            .by_name("package.bin")
            .expect("package.bin entry")
            .read_to_end(&mut package_bin)
            .expect("read package.bin");

        let (version, manifest) = parse_bundle_manifest(&package_bin);
        assert_eq!(version, BUNDLE_VERSION);
        assert_eq!(
            manifest["assets"]["large-a"]["encoding"],
            Value::String("raw".to_string())
        );
        assert_eq!(
            manifest["assets"]["large-b"]["encoding"],
            Value::String("raw".to_string())
        );

        fs::remove_dir_all(test_dir).expect("remove temp test dir");
    }

    #[test]
    fn streamed_zip_export_normalizes_invalid_font_mime_from_bytes() {
        let test_dir = create_unique_test_dir();
        let font_path = test_dir.join("font.bin");
        let output_path = test_dir.join("export.zip");
        let font_bytes = vec![0x00, 0x01, 0x00, 0x00, 0x12, 0x34, 0x56, 0x78];

        fs::write(&font_path, &font_bytes).expect("write font fixture");

        let stats = create_distribution_zip_streamed_sync(
            output_path.display().to_string(),
            vec![ZipAssetInput {
                id: "font-a".to_string(),
                path: font_path.display().to_string(),
                mime: Some("font/sample_font".to_string()),
            }],
            r#"{"projectData":{"story":{"initialSceneId":"scene-1","scenes":{"scene-1":{"initialSectionId":"section-1","sections":{"section-1":{"lines":[]}}}}}}}"#
                .to_string(),
            Some("<!doctype html><html></html>".to_string()),
            Some("console.log('bundle');".to_string()),
            false,
        )
        .expect("streamed zip export should succeed");

        assert_eq!(stats.asset_count, 1);

        let zip_file = File::open(&output_path).expect("open output zip");
        let mut archive = ZipArchive::new(zip_file).expect("open zip archive");
        let mut package_bin = Vec::new();
        archive
            .by_name("package.bin")
            .expect("package.bin entry")
            .read_to_end(&mut package_bin)
            .expect("read package.bin");

        let (version, manifest) = parse_bundle_manifest(&package_bin);
        assert_eq!(version, BUNDLE_VERSION);
        assert_eq!(
            manifest["assets"]["font-a"]["mime"],
            Value::String("font/ttf".to_string())
        );

        fs::remove_dir_all(test_dir).expect("remove temp test dir");
    }
}
