//! Launcher and splash icon rendering.

use std::io::Cursor;
use std::path::Path;

use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::imageops::{self, FilterType as ResizeFilter};
use image::{ExtendedColorType, ImageEncoder, ImageReader, RgbaImage};
use serde::{Deserialize, Serialize};

use crate::error::{ErrorCode, ExportError, Result};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImageKind {
    /// Pre-API-26 launcher icon. Shown unmasked.
    Legacy,
    /// Adaptive icon foreground on a 108 dp canvas. Launchers show the
    /// centered 72 dp and may mask it to any shape.
    AdaptiveForeground,
    /// Splash icon on a 288 dp canvas. Android keeps a centered 192 dp circle.
    Splash,
}

impl ImageKind {
    /// Size in dp of the canvas for this kind.
    pub fn canvas_dp(self) -> u32 {
        match self {
            Self::Legacy => 48,
            Self::AdaptiveForeground => 108,
            Self::Splash => 288,
        }
    }

    /// Pixel size at an Android density (160 = mdpi).
    pub fn pixel_size(self, density: u16) -> u32 {
        self.canvas_dp() * u32::from(density) / 160
    }
}

/// Source images for the template slots.
pub struct IconImages {
    pub app: RgbaImage,
    pub adaptive: Option<RgbaImage>,
    pub splash: Option<RgbaImage>,
}

impl IconImages {
    pub fn render(&self, kind: ImageKind, size: u32) -> Result<Vec<u8>> {
        let (source, fraction) = match kind {
            ImageKind::Legacy => (&self.app, 1.0),
            // Without an adaptive icon, the app icon fills the visible square
            // too, and the launcher's mask trims its corners.
            ImageKind::AdaptiveForeground => {
                (self.adaptive.as_ref().unwrap_or(&self.app), 72.0 / 108.0)
            }
            ImageKind::Splash => match &self.splash {
                Some(image) => (image, 192.0 / 288.0),
                None => (&self.app, 192.0 / std::f64::consts::SQRT_2 / 288.0),
            },
        };
        render(source, fraction, size)
    }
}

pub fn load_icon(path: &Path, label: &str) -> Result<RgbaImage> {
    let reader = ImageReader::open(path)
        .and_then(|reader| reader.with_guessed_format())
        .map_err(|error| icon_error(format!("Failed to open the {label}: {error}")))?;
    let image = reader
        .decode()
        .map_err(|error| icon_error(format!("Failed to read the {label} image: {error}")))?;
    if image.width() == 0 || image.height() == 0 {
        return Err(icon_error(format!("The {label} image is empty.")));
    }
    Ok(image.to_rgba8())
}

/// Renders `icon` scaled to fit the specified fraction of the canvas,
/// centered on a transparent square canvas of `size` pixels.
pub fn render(icon: &RgbaImage, content_fraction: f64, size: u32) -> Result<Vec<u8>> {
    let content = ((f64::from(size) * content_fraction).round() as u32).clamp(1, size);
    let scale = f64::from(content) / f64::from(icon.width().max(icon.height()));
    let width = ((f64::from(icon.width()) * scale).round() as u32).clamp(1, content);
    let height = ((f64::from(icon.height()) * scale).round() as u32).clamp(1, content);
    let resized = imageops::resize(icon, width, height, ResizeFilter::Lanczos3);

    let mut canvas = RgbaImage::new(size, size);
    imageops::overlay(
        &mut canvas,
        &resized,
        i64::from((size - width) / 2),
        i64::from((size - height) / 2),
    );
    encode_png(&canvas)
}

pub fn encode_png(image: &RgbaImage) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    PngEncoder::new_with_quality(
        Cursor::new(&mut bytes),
        CompressionType::Best,
        FilterType::Adaptive,
    )
    .write_image(
        image.as_raw(),
        image.width(),
        image.height(),
        ExtendedColorType::Rgba8,
    )
    .map_err(|error| icon_error(format!("Failed to encode an icon: {error}")))?;
    Ok(bytes)
}

pub fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?
        .into_dimensions()
        .ok()
}

fn icon_error(message: impl Into<String>) -> ExportError {
    ExportError::new(ErrorCode::IconInvalid, message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    fn decode(bytes: &[u8]) -> RgbaImage {
        image::load_from_memory(bytes).unwrap().to_rgba8()
    }

    #[test]
    fn pixel_sizes_follow_density_buckets() {
        let densities = [160u16, 240, 320, 480, 640];
        let legacy: Vec<u32> = densities
            .iter()
            .map(|d| ImageKind::Legacy.pixel_size(*d))
            .collect();
        let foreground: Vec<u32> = densities
            .iter()
            .map(|d| ImageKind::AdaptiveForeground.pixel_size(*d))
            .collect();
        let splash: Vec<u32> = densities
            .iter()
            .map(|d| ImageKind::Splash.pixel_size(*d))
            .collect();
        assert_eq!(legacy, [48, 72, 96, 144, 192]);
        assert_eq!(foreground, [108, 162, 216, 324, 432]);
        assert_eq!(splash, [288, 432, 576, 864, 1152]);
    }

    #[test]
    fn renders_icons_inside_their_safe_areas() {
        let icon = RgbaImage::from_pixel(64, 64, Rgba([200, 40, 40, 255]));

        let legacy = decode(&render(&icon, 1.0, 48).unwrap());
        assert_eq!(legacy.dimensions(), (48, 48));
        assert_eq!(legacy.get_pixel(0, 0)[3], 255);

        let splash = decode(&render(&icon, 192.0 / std::f64::consts::SQRT_2 / 288.0, 288).unwrap());
        let inside_circle = |x: u32, y: u32| {
            let dx = f64::from(x) + 0.5 - 144.0;
            let dy = f64::from(y) + 0.5 - 144.0;
            dx * dx + dy * dy <= 96.0 * 96.0
        };
        for (x, y, pixel) in splash.enumerate_pixels() {
            if pixel[3] > 0 {
                assert!(
                    inside_circle(x, y),
                    "opaque pixel at {x},{y} is outside the splash circle"
                );
            }
        }
        assert_eq!(splash.get_pixel(144, 144)[3], 255);
    }

    #[test]
    fn app_icon_fills_the_visible_square_without_an_adaptive_icon() {
        let icon = RgbaImage::from_pixel(64, 64, Rgba([200, 40, 40, 255]));
        let images = IconImages {
            app: icon,
            adaptive: None,
            splash: None,
        };
        let image = decode(&images.render(ImageKind::AdaptiveForeground, 108).unwrap());
        assert_eq!(image.get_pixel(18, 18)[3], 255);
        assert_eq!(image.get_pixel(89, 89)[3], 255);
        assert_eq!(image.get_pixel(17, 18)[3], 0);
        assert_eq!(image.get_pixel(90, 89)[3], 0);
    }

    #[test]
    fn renders_provided_images_in_visible_squares() {
        let icon = RgbaImage::from_pixel(64, 64, Rgba([200, 40, 40, 255]));
        let images = IconImages {
            app: icon.clone(),
            adaptive: Some(icon.clone()),
            splash: Some(icon),
        };
        for (kind, size, start, end) in [
            (ImageKind::AdaptiveForeground, 108, 18, 89),
            (ImageKind::Splash, 288, 48, 239),
        ] {
            let image = decode(&images.render(kind, size).unwrap());
            assert_eq!(image.get_pixel(start, start)[3], 255);
            assert_eq!(image.get_pixel(end, end)[3], 255);
            assert_eq!(image.get_pixel(start - 1, start)[3], 0);
            assert_eq!(image.get_pixel(end + 1, end)[3], 0);
        }
    }

    #[test]
    fn image_load_errors_identify_the_source() {
        let dir = tempfile::tempdir().unwrap();
        let invalid = dir.path().join("invalid.png");
        std::fs::write(&invalid, b"not an image").unwrap();
        for path in [dir.path().join("missing.png"), invalid] {
            for label in ["app icon", "adaptive icon", "splash icon"] {
                let error = load_icon(&path, label).unwrap_err();
                assert_eq!(error.code, ErrorCode::IconInvalid);
                assert!(error.message.contains(label));
            }
        }
    }

    #[test]
    fn fits_non_square_icons() {
        let wide = RgbaImage::from_pixel(100, 50, Rgba([0, 0, 255, 255]));
        let rendered = decode(&render(&wide, 1.0, 48).unwrap());
        assert_eq!(rendered.get_pixel(24, 2)[3], 0);
        assert_eq!(rendered.get_pixel(24, 24)[3], 255);
    }
}
