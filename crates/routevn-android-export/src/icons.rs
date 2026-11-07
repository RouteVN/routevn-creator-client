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

    /// Fraction of the canvas the game icon occupies.
    pub fn content_fraction(self) -> f64 {
        match self {
            Self::Legacy => 1.0,
            Self::AdaptiveForeground => 72.0 / 108.0,
            // The largest square inside the 192 dp circle, on a 288 dp canvas.
            Self::Splash => 192.0 / std::f64::consts::SQRT_2 / 288.0,
        }
    }

    /// Pixel size at an Android density (160 = mdpi).
    pub fn pixel_size(self, density: u16) -> u32 {
        self.canvas_dp() * u32::from(density) / 160
    }
}

pub fn load_icon(path: &Path) -> Result<RgbaImage> {
    let reader = ImageReader::open(path)
        .and_then(|reader| reader.with_guessed_format())
        .map_err(|error| icon_error(format!("Failed to open the icon: {error}")))?;
    let image = reader
        .decode()
        .map_err(|error| icon_error(format!("Failed to read the icon image: {error}")))?;
    if image.width() == 0 || image.height() == 0 {
        return Err(icon_error("The icon image is empty."));
    }
    Ok(image.to_rgba8())
}

/// Renders `icon` for one slot: scaled to fit the kind's content area,
/// centered on a transparent square canvas of `size` pixels.
pub fn render(icon: &RgbaImage, kind: ImageKind, size: u32) -> Result<Vec<u8>> {
    let content = ((f64::from(size) * kind.content_fraction()).round() as u32).clamp(1, size);
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

        let legacy = decode(&render(&icon, ImageKind::Legacy, 48).unwrap());
        assert_eq!(legacy.dimensions(), (48, 48));
        assert_eq!(legacy.get_pixel(0, 0)[3], 255);

        let foreground = decode(&render(&icon, ImageKind::AdaptiveForeground, 108).unwrap());
        assert_eq!(foreground.get_pixel(17, 54)[3], 0);
        assert_eq!(foreground.get_pixel(19, 54)[3], 255);
        assert_eq!(foreground.get_pixel(54, 54)[3], 255);

        let splash = decode(&render(&icon, ImageKind::Splash, 288).unwrap());
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
    fn fits_non_square_icons() {
        let wide = RgbaImage::from_pixel(100, 50, Rgba([0, 0, 255, 255]));
        let rendered = decode(&render(&wide, ImageKind::Legacy, 48).unwrap());
        assert_eq!(rendered.get_pixel(24, 2)[3], 0);
        assert_eq!(rendered.get_pixel(24, 24)[3], 255);
    }
}
