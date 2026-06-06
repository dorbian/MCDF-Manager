//! MCDF file parser and builder.
//!
//! Brio writes MCDF files through `K4os.Compression.LZ4.Legacy.LZ4Stream`.
//! The bytes on disk are therefore a K4os legacy LZ4 chunk stream.  After
//! decompression the inner payload is:
//!
//!   4 bytes: "MCDF" magic
//!   1 byte: version (currently 1)
//!   4 bytes: JSON metadata length (little-endian u32)
//!   N bytes: UTF-8 JSON metadata (`MareCharaFileData`)
//!   Remaining bytes: concatenated internal file payloads in metadata order.
//!
//! Older debug builds guessed at the inner marker inside the compressed bytes.
//! This parser first decodes the K4os legacy stream, then parses the real inner
//! MCDF container.

use flate2::read::GzDecoder;
use lz4_flex::block;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};

const K4OS_LEGACY_BLOCK_SIZE: usize = 1024 * 1024;
const K4OS_FLAG_COMPRESSED: u64 = 0x01;
const K4OS_FLAG_HIGH_COMPRESSION: u64 = 0x02;
const CONTAINER_RAW: &str = "raw_mcdf";
const CONTAINER_K4OS_LZ4_LEGACY: &str = "k4os_lz4_legacy";
const CONTAINER_GZIP: &str = "gzip_wrapped";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileData {
    #[serde(default, rename = "GamePaths", alias = "game_paths", alias = "gamePaths")]
    pub game_paths: Vec<String>,
    #[serde(default, rename = "Length", alias = "length")]
    pub length: u32,
    #[serde(default, rename = "Hash", alias = "hash")]
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MareCharaFileData {
    #[serde(default, rename = "Description", alias = "description")]
    pub description: String,
    #[serde(default, rename = "GlamourerData", alias = "glamourer_data", alias = "glamourerData")]
    pub glamourer_data: String,
    #[serde(default, rename = "CustomizePlusData", alias = "customize_plus_data", alias = "customizePlusData")]
    pub customize_plus_data: String,
    #[serde(default, rename = "ManipulationData", alias = "manipulation_data", alias = "manipulationData")]
    pub manipulation_data: String,
    #[serde(default, rename = "Files", alias = "files")]
    pub files: Vec<FileData>,
    #[serde(default, rename = "FileSwaps", alias = "file_swaps", alias = "fileSwaps")]
    pub file_swaps: Vec<FileSwap>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSwap {
    #[serde(default, rename = "GamePaths", alias = "game_paths", alias = "gamePaths")]
    pub game_paths: Vec<String>,
    #[serde(default, rename = "FileSwapPath", alias = "file_swap_path", alias = "fileSwapPath")]
    pub file_swap_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedFileInfo {
    pub index: usize,
    pub game_paths: Vec<String>,
    pub length: u32,
    pub hash: String,
    pub offset: u64,
    pub blake3: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedFilePayload {
    pub info: ExtractedFileInfo,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct ParsedMCDFPackage {
    pub metadata: MareCharaFileData,
    pub decoded_container_blake3: String,
    /// Internal files are represented as offsets into `decoded_bytes`.
    /// This avoids cloning every payload during analysis and lets upload code
    /// send only the missing registry slices after the hash probe returns.
    pub files: Vec<ExtractedFileInfo>,
    pub decoded_bytes: Vec<u8>,
    pub prefix_bytes: Vec<u8>,
    pub header_bytes: Vec<u8>,
    pub trailer_bytes: Vec<u8>,
    pub mcdf_offset: usize,
    pub version: u8,
    pub json_len: usize,
    pub payload_start: usize,
    pub payload_end: usize,
    pub container_encoding: String,
}

impl ParsedMCDFPackage {
    pub fn file_payload_slice(&self, info: &ExtractedFileInfo) -> Result<&[u8], MCDFError> {
        let start = self.payload_start
            .checked_add(info.offset as usize)
            .ok_or_else(|| MCDFError::InvalidPayload("file slice start overflow".to_string()))?;
        let end = start
            .checked_add(info.length as usize)
            .ok_or_else(|| MCDFError::InvalidPayload("file slice end overflow".to_string()))?;
        if end > self.payload_end || end > self.decoded_bytes.len() {
            return Err(MCDFError::InvalidPayload(format!(
                "file #{} slice exceeds decoded payload: end {end}, payload_end {}, decoded {}",
                info.index, self.payload_end, self.decoded_bytes.len()
            )));
        }
        Ok(&self.decoded_bytes[start..end])
    }

    pub fn file_payload_slice_by_blake3(&self, hash: &str) -> Result<&[u8], MCDFError> {
        let Some(info) = self.files.iter().find(|file| file.blake3 == hash) else {
            return Err(MCDFError::InvalidPayload(format!("unknown internal file hash {hash}")));
        };
        self.file_payload_slice(info)
    }

    pub fn rebuild_inner<W: Write>(&self, writer: &mut W, files_data: &[&[u8]]) -> Result<(), MCDFError> {
        writer.write_all(&self.prefix_bytes)?;
        writer.write_all(&self.header_bytes)?;
        for file_data in files_data {
            writer.write_all(file_data)?;
        }
        writer.write_all(&self.trailer_bytes)?;
        Ok(())
    }

    pub fn rebuild_inner_bytes(&self, files_data: &[&[u8]]) -> Result<Vec<u8>, MCDFError> {
        let mut inner = Vec::new();
        self.rebuild_inner(&mut inner, files_data)?;
        Ok(inner)
    }

    pub fn rebuild_exact<W: Write>(&self, writer: &mut W, files_data: &[&[u8]]) -> Result<(), MCDFError> {
        let mut inner = Vec::new();
        self.rebuild_inner(&mut inner, files_data)?;
        match self.container_encoding.as_str() {
            CONTAINER_RAW => writer.write_all(&inner)?,
            CONTAINER_K4OS_LZ4_LEGACY => writer.write_all(&k4os_legacy_compress(&inner))?,
            CONTAINER_GZIP => writer.write_all(&inner)?,
            other => return Err(MCDFError::InvalidPayload(format!("unknown container encoding {other}"))),
        }
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum MCDFError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("File too small ({actual} bytes, need at least {needed})")]
    TooSmall { actual: usize, needed: usize },

    #[error("Invalid MCDF magic bytes: {0}; expected MCDF")]
    InvalidMagic(String),

    #[error("Unsupported MCDF version: {0}")]
    UnsupportedVersion(u8),

    #[error("Invalid MCDF payload: {0}")]
    InvalidPayload(String),

    #[error("gzip decompression failed: {0}")]
    Gzip(String),

    #[error("K4os legacy LZ4 decompression failed: {0}")]
    K4osLegacy(String),
}

pub struct MCDFParser;

impl MCDFParser {
    pub fn parse<R: Read>(reader: &mut R) -> Result<(MareCharaFileData, Vec<u8>), MCDFError> {
        let package = Self::parse_package(reader)?;
        let binary_payload = package
            .files
            .iter()
            .map(|info| package.file_payload_slice(info))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .flat_map(|bytes| bytes.to_vec())
            .collect::<Vec<_>>();
        Ok((package.metadata, binary_payload))
    }

    pub fn parse_package<R: Read>(reader: &mut R) -> Result<ParsedMCDFPackage, MCDFError> {
        let mut all_data = Vec::new();
        reader.read_to_end(&mut all_data)?;

        if all_data.len() < 4 {
            return Err(MCDFError::TooSmall { actual: all_data.len(), needed: 4 });
        }

        if all_data.starts_with(&[0x1f, 0x8b, 0x08]) {
            let mut gz = GzDecoder::new(&all_data[..]);
            let mut decompressed = Vec::new();
            gz.read_to_end(&mut decompressed)
                .map_err(|e| MCDFError::Gzip(e.to_string()))?;
            let mut parsed = Self::parse_inner_mcdf_from_owned(decompressed)?;
            parsed.container_encoding = CONTAINER_GZIP.to_string();
            return Ok(parsed);
        }

        if !all_data.starts_with(b"MCDF") {
            if let Ok(decompressed) = k4os_legacy_decompress(&all_data) {
                if find_mcdf_marker(&decompressed).is_some() {
                    let mut parsed = Self::parse_inner_mcdf_from_owned(decompressed)?;
                    parsed.container_encoding = CONTAINER_K4OS_LZ4_LEGACY.to_string();
                    return Ok(parsed);
                }
            }
        }

        let mut parsed = Self::parse_inner_mcdf_from_owned(all_data)?;
        parsed.container_encoding = CONTAINER_RAW.to_string();
        Ok(parsed)
    }

    pub(crate) fn parse_from_slice(data: &[u8]) -> Result<(MareCharaFileData, Vec<u8>), MCDFError> {
        let package = Self::parse_package_from_slice(data)?;
        let binary_payload = package
            .files
            .iter()
            .map(|info| package.file_payload_slice(info))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .flat_map(|bytes| bytes.to_vec())
            .collect::<Vec<_>>();
        Ok((package.metadata, binary_payload))
    }

    pub(crate) fn parse_package_from_slice(data: &[u8]) -> Result<ParsedMCDFPackage, MCDFError> {
        if data.starts_with(&[0x1f, 0x8b, 0x08]) {
            let mut gz = GzDecoder::new(data);
            let mut decompressed = Vec::new();
            gz.read_to_end(&mut decompressed)
                .map_err(|e| MCDFError::Gzip(e.to_string()))?;
            let mut parsed = Self::parse_inner_mcdf_from_owned(decompressed)?;
            parsed.container_encoding = CONTAINER_GZIP.to_string();
            return Ok(parsed);
        }

        if !data.starts_with(b"MCDF") {
            if let Ok(decompressed) = k4os_legacy_decompress(data) {
                if find_mcdf_marker(&decompressed).is_some() {
                    let mut parsed = Self::parse_inner_mcdf_from_owned(decompressed)?;
                    parsed.container_encoding = CONTAINER_K4OS_LZ4_LEGACY.to_string();
                    return Ok(parsed);
                }
            }
        }

        let mut parsed = Self::parse_inner_mcdf_from_owned(data.to_vec())?;
        parsed.container_encoding = CONTAINER_RAW.to_string();
        Ok(parsed)
    }

    fn parse_inner_mcdf_from_slice(data: &[u8]) -> Result<ParsedMCDFPackage, MCDFError> {
        Self::parse_inner_mcdf_from_owned(data.to_vec())
    }

    fn parse_inner_mcdf_from_owned(data: Vec<u8>) -> Result<ParsedMCDFPackage, MCDFError> {
        if data.len() < 9 {
            return Err(MCDFError::TooSmall { actual: data.len(), needed: 9 });
        }

        let mcdf_offset = find_mcdf_marker(&data).ok_or_else(|| {
            let preview_len = data.len().min(4);
            let mut preview = [0u8; 4];
            preview[..preview_len].copy_from_slice(&data[..preview_len]);
            MCDFError::InvalidMagic(format!(
                "{:02x?} {:02x?} {:02x?} {:02x?}",
                preview[0], preview[1], preview[2], preview[3]
            ))
        })?;

        let inner = &data[mcdf_offset..];
        if inner.len() < 9 {
            return Err(MCDFError::TooSmall { actual: inner.len(), needed: 9 });
        }

        let (magic, rest) = inner.split_at(4);
        if magic != b"MCDF" {
            return Err(MCDFError::InvalidMagic(format!(
                "{:02x?} {:02x?} {:02x?} {:02x?}",
                magic[0], magic[1], magic[2], magic[3]
            )));
        }

        let version = rest[0];
        if version != 1 {
            return Err(MCDFError::UnsupportedVersion(version));
        }

        let declared_json_len = u32::from_le_bytes([rest[1], rest[2], rest[3], rest[4]]) as usize;
        let json_start = mcdf_offset + 9;
        let declared_json_end = json_start
            .checked_add(declared_json_len)
            .ok_or_else(|| MCDFError::InvalidPayload("JSON length overflow".to_string()))?;

        if data.len() < declared_json_end {
            return Err(MCDFError::InvalidPayload(format!(
                "JSON claims {declared_json_len} bytes, but only {} bytes remain",
                data.len().saturating_sub(json_start)
            )));
        }

        let json_data = &data[json_start..declared_json_end];
        let (metadata, actual_json_len) = parse_metadata_with_fallbacks(json_data, &data, json_start, declared_json_len)?;
        let expected_payload_len: usize = metadata.files.iter().map(|f| f.length as usize).sum();
        let payload_start = json_start
            .checked_add(actual_json_len)
            .ok_or_else(|| MCDFError::InvalidPayload("payload start overflow".to_string()))?;
        let payload_end = payload_start
            .checked_add(expected_payload_len)
            .ok_or_else(|| MCDFError::InvalidPayload("payload length overflow".to_string()))?;

        if data.len() < payload_end {
            return Err(MCDFError::InvalidPayload(format!(
                "metadata expects {expected_payload_len} payload bytes, but file has {} bytes",
                data.len().saturating_sub(payload_start)
            )));
        }

        let binary_payload = &data[payload_start..payload_end];
        let files = Self::extract_file_infos(&metadata, binary_payload)?;
        let decoded_container_blake3 = blake3::hash(&data).to_hex().to_string();
        let prefix_bytes = data[..mcdf_offset].to_vec();
        let header_bytes = data[mcdf_offset..payload_start].to_vec();
        let trailer_bytes = data[payload_end..].to_vec();

        Ok(ParsedMCDFPackage {
            metadata,
            decoded_container_blake3,
            files,
            decoded_bytes: data,
            prefix_bytes,
            header_bytes,
            trailer_bytes,
            mcdf_offset,
            version,
            json_len: actual_json_len,
            payload_start,
            payload_end,
            container_encoding: CONTAINER_RAW.to_string(),
        })
    }

    pub fn extract_file_infos(metadata: &MareCharaFileData, binary_payload: &[u8]) -> Result<Vec<ExtractedFileInfo>, MCDFError> {
        let mut files = Vec::new();
        let mut offset = 0usize;

        for (index, file_data) in metadata.files.iter().enumerate() {
            let end = offset
                .checked_add(file_data.length as usize)
                .ok_or_else(|| MCDFError::InvalidPayload("file offset overflow".to_string()))?;

            if end > binary_payload.len() {
                return Err(MCDFError::InvalidPayload(format!(
                    "file #{index} exceeds payload length: end {end}, payload {}",
                    binary_payload.len()
                )));
            }

            let blake3 = blake3::hash(&binary_payload[offset..end]).to_hex().to_string();
            files.push(ExtractedFileInfo {
                index,
                game_paths: file_data.game_paths.clone(),
                length: file_data.length,
                hash: file_data.hash.clone(),
                offset: offset as u64,
                blake3,
            });
            offset = end;
        }

        Ok(files)
    }

    pub fn extract_file_payloads(metadata: &MareCharaFileData, binary_payload: &[u8]) -> Result<Vec<ExtractedFilePayload>, MCDFError> {
        let mut files = Vec::new();
        let mut offset = 0usize;

        for (index, file_data) in metadata.files.iter().enumerate() {
            let end = offset
                .checked_add(file_data.length as usize)
                .ok_or_else(|| MCDFError::InvalidPayload("file offset overflow".to_string()))?;

            if end > binary_payload.len() {
                return Err(MCDFError::InvalidPayload(format!(
                    "file #{index} exceeds payload length: end {end}, payload {}",
                    binary_payload.len()
                )));
            }

            let bytes = binary_payload[offset..end].to_vec();
            let blake3 = blake3::hash(&bytes).to_hex().to_string();
            files.push(ExtractedFilePayload {
                info: ExtractedFileInfo {
                    index,
                    game_paths: file_data.game_paths.clone(),
                    length: file_data.length,
                    hash: file_data.hash.clone(),
                    offset: offset as u64,
                    blake3,
                },
                bytes,
            });
            offset = end;
        }

        Ok(files)
    }

    pub fn decode_container_bytes(data: &[u8]) -> Result<(Vec<u8>, String), MCDFError> {
        if data.starts_with(&[0x1f, 0x8b, 0x08]) {
            let mut gz = GzDecoder::new(data);
            let mut decompressed = Vec::new();
            gz.read_to_end(&mut decompressed)
                .map_err(|e| MCDFError::Gzip(e.to_string()))?;
            return Ok((decompressed, CONTAINER_GZIP.to_string()));
        }

        if !data.starts_with(b"MCDF") {
            if let Ok(decompressed) = k4os_legacy_decompress(data) {
                if find_mcdf_marker(&decompressed).is_some() {
                    return Ok((decompressed, CONTAINER_K4OS_LZ4_LEGACY.to_string()));
                }
            }
        }

        Ok((data.to_vec(), CONTAINER_RAW.to_string()))
    }

    pub fn decoded_container_blake3(data: &[u8]) -> Result<(String, String), MCDFError> {
        let (decoded, encoding) = Self::decode_container_bytes(data)?;
        Ok((blake3::hash(&decoded).to_hex().to_string(), encoding))
    }

    pub fn rebuild<W: Write>(writer: &mut W, metadata: &MareCharaFileData, files_data: &[&[u8]]) -> Result<(), MCDFError> {
        writer.write_all(b"MCDF")?;
        writer.write_all(&[1u8])?;

        let json_bytes = serde_json::to_vec(metadata)?;
        let json_len = json_bytes.len() as u32;

        writer.write_all(&json_len.to_le_bytes())?;
        writer.write_all(&json_bytes)?;

        for file_data in files_data {
            writer.write_all(file_data)?;
        }

        Ok(())
    }
}

fn parse_metadata_with_fallbacks(
    declared_json_data: &[u8],
    full_data: &[u8],
    json_start: usize,
    declared_json_len: usize,
) -> Result<(MareCharaFileData, usize), MCDFError> {
    if let Ok(metadata) = serde_json::from_slice::<MareCharaFileData>(declared_json_data) {
        return Ok((metadata, declared_json_len));
    }

    if let Some(scanned_len) = scan_balanced_json_object(&full_data[json_start..]) {
        if scanned_len != declared_json_len {
            let scanned_data = &full_data[json_start..json_start + scanned_len];
            if let Ok(metadata) = serde_json::from_slice::<MareCharaFileData>(scanned_data) {
                return Ok((metadata, scanned_len));
            }
        }
    }

    let metadata = parse_lenient_metadata(declared_json_data)?;
    if metadata.files.is_empty() {
        return Err(MCDFError::InvalidPayload(
            "metadata did not contain any Files entries after lenient parsing".to_string(),
        ));
    }
    Ok((metadata, declared_json_len))
}

fn parse_lenient_metadata(json_data: &[u8]) -> Result<MareCharaFileData, MCDFError> {
    let files = parse_files_array_lenient(json_data)?;
    let file_swaps = parse_file_swaps_array_lenient(json_data).unwrap_or_default();
    Ok(MareCharaFileData {
        description: extract_json_string_field(json_data, b"Description").unwrap_or_default(),
        glamourer_data: extract_json_string_field(json_data, b"GlamourerData").unwrap_or_default(),
        customize_plus_data: extract_json_string_field(json_data, b"CustomizePlusData").unwrap_or_default(),
        manipulation_data: extract_json_string_field(json_data, b"ManipulationData").unwrap_or_default(),
        files,
        file_swaps,
    })
}

fn parse_files_array_lenient(json_data: &[u8]) -> Result<Vec<FileData>, MCDFError> {
    let array = extract_json_array_field(json_data, b"Files")
        .ok_or_else(|| MCDFError::InvalidPayload("metadata has no Files array".to_string()))?;
    serde_json::from_slice::<Vec<FileData>>(array).map_err(MCDFError::Json)
}

fn parse_file_swaps_array_lenient(json_data: &[u8]) -> Result<Vec<FileSwap>, MCDFError> {
    let Some(array) = extract_json_array_field(json_data, b"FileSwaps") else {
        return Ok(Vec::new());
    };
    serde_json::from_slice::<Vec<FileSwap>>(array).map_err(MCDFError::Json)
}

fn extract_json_array_field<'a>(json_data: &'a [u8], field: &[u8]) -> Option<&'a [u8]> {
    let key = quoted_key(field);
    let key_pos = find_bytes(json_data, &key)?;
    let mut cursor = key_pos + key.len();
    cursor = skip_ws(json_data, cursor);
    if json_data.get(cursor) != Some(&b':') {
        return None;
    }
    cursor = skip_ws(json_data, cursor + 1);
    if json_data.get(cursor) != Some(&b'[') {
        return None;
    }
    let len = scan_balanced_json_value(&json_data[cursor..])?;
    Some(&json_data[cursor..cursor + len])
}

fn extract_json_string_field(json_data: &[u8], field: &[u8]) -> Option<String> {
    let key = quoted_key(field);
    let key_pos = find_bytes(json_data, &key)?;
    let mut cursor = key_pos + key.len();
    cursor = skip_ws(json_data, cursor);
    if json_data.get(cursor) != Some(&b':') {
        return None;
    }
    cursor = skip_ws(json_data, cursor + 1);
    if json_data.get(cursor) != Some(&b'"') {
        return None;
    }
    let len = scan_json_string(&json_data[cursor..])?;
    serde_json::from_slice::<String>(&json_data[cursor..cursor + len]).ok()
}

fn quoted_key(field: &[u8]) -> Vec<u8> {
    let mut key = Vec::with_capacity(field.len() + 2);
    key.push(b'"');
    key.extend_from_slice(field);
    key.push(b'"');
    key
}

fn skip_ws(data: &[u8], mut cursor: usize) -> usize {
    while let Some(byte) = data.get(cursor) {
        if !matches!(byte, b' ' | b'\n' | b'\r' | b'\t') {
            break;
        }
        cursor += 1;
    }
    cursor
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|window| window == needle)
}

fn scan_balanced_json_object(data: &[u8]) -> Option<usize> {
    if data.first() != Some(&b'{') {
        return None;
    }
    scan_balanced_json_value(data)
}

fn scan_balanced_json_value(data: &[u8]) -> Option<usize> {
    let first = *data.first()?;
    match first {
        b'{' | b'[' => {
            let mut stack: Vec<u8> = Vec::new();
            let mut in_string = false;
            let mut escaped = false;

            for (index, byte) in data.iter().enumerate() {
                if in_string {
                    if escaped {
                        escaped = false;
                        continue;
                    }
                    match *byte {
                        b'\\' => escaped = true,
                        b'"' => in_string = false,
                        _ => {}
                    }
                    continue;
                }

                match *byte {
                    b'"' => in_string = true,
                    b'{' | b'[' => stack.push(*byte),
                    b'}' => {
                        if stack.pop() != Some(b'{') {
                            return None;
                        }
                        if stack.is_empty() {
                            return Some(index + 1);
                        }
                    }
                    b']' => {
                        if stack.pop() != Some(b'[') {
                            return None;
                        }
                        if stack.is_empty() {
                            return Some(index + 1);
                        }
                    }
                    _ => {}
                }
            }
            None
        }
        b'"' => scan_json_string(data),
        _ => None,
    }
}

fn scan_json_string(data: &[u8]) -> Option<usize> {
    if data.first() != Some(&b'"') {
        return None;
    }
    let mut escaped = false;
    for (index, byte) in data.iter().enumerate().skip(1) {
        if escaped {
            escaped = false;
            continue;
        }
        match *byte {
            b'\\' => escaped = true,
            b'"' => return Some(index + 1),
            _ => {}
        }
    }
    None
}

fn find_mcdf_marker(data: &[u8]) -> Option<usize> {
    if data.starts_with(b"MCDF") {
        return Some(0);
    }
    data.windows(4).position(|window| window == b"MCDF")
}

fn k4os_legacy_decompress(data: &[u8]) -> Result<Vec<u8>, MCDFError> {
    let mut cursor = 0usize;
    let mut output = Vec::new();
    let mut chunk_index = 0usize;

    while cursor < data.len() {
        let Some(flags) = read_varint(data, &mut cursor)? else {
            break;
        };
        let original_len = read_required_varint(data, &mut cursor, "original length")? as usize;
        if original_len == 0 {
            chunk_index += 1;
            continue;
        }
        if original_len > 256 * 1024 * 1024 {
            return Err(MCDFError::K4osLegacy(format!(
                "chunk #{chunk_index} original length {original_len} is not plausible"
            )));
        }

        let is_compressed = (flags & K4OS_FLAG_COMPRESSED) != 0;
        let compressed_len = if is_compressed {
            read_required_varint(data, &mut cursor, "compressed length")? as usize
        } else {
            original_len
        };

        let end = cursor
            .checked_add(compressed_len)
            .ok_or_else(|| MCDFError::K4osLegacy("compressed chunk offset overflow".to_string()))?;
        if end > data.len() {
            return Err(MCDFError::K4osLegacy(format!(
                "chunk #{chunk_index} claims {compressed_len} bytes but only {} remain",
                data.len().saturating_sub(cursor)
            )));
        }
        let chunk = &data[cursor..end];
        cursor = end;

        if is_compressed {
            let decoded = block::decompress(chunk, original_len)
                .map_err(|error| MCDFError::K4osLegacy(format!("chunk #{chunk_index}: {error}")))?;
            if decoded.len() != original_len {
                return Err(MCDFError::K4osLegacy(format!(
                    "chunk #{chunk_index} decoded to {} bytes, expected {original_len}",
                    decoded.len()
                )));
            }
            output.extend_from_slice(&decoded);
        } else {
            if chunk.len() != original_len {
                return Err(MCDFError::K4osLegacy(format!(
                    "chunk #{chunk_index} stored chunk length {} did not match original length {original_len}",
                    chunk.len()
                )));
            }
            output.extend_from_slice(chunk);
        }
        chunk_index += 1;
    }

    if output.is_empty() {
        return Err(MCDFError::K4osLegacy("stream did not contain any chunks".to_string()));
    }
    Ok(output)
}

fn k4os_legacy_compress(data: &[u8]) -> Vec<u8> {
    let mut output = Vec::new();
    for chunk in data.chunks(K4OS_LEGACY_BLOCK_SIZE) {
        let compressed = block::compress(chunk);
        let use_compressed = compressed.len() < chunk.len();
        let mut flags = K4OS_FLAG_HIGH_COMPRESSION;
        if use_compressed {
            flags |= K4OS_FLAG_COMPRESSED;
        }
        write_varint(&mut output, flags);
        write_varint(&mut output, chunk.len() as u64);
        if use_compressed {
            write_varint(&mut output, compressed.len() as u64);
            output.extend_from_slice(&compressed);
        } else {
            output.extend_from_slice(chunk);
        }
    }
    output
}

fn read_required_varint(data: &[u8], cursor: &mut usize, label: &str) -> Result<u64, MCDFError> {
    read_varint(data, cursor)?.ok_or_else(|| MCDFError::K4osLegacy(format!("missing {label} varint")))
}

fn read_varint(data: &[u8], cursor: &mut usize) -> Result<Option<u64>, MCDFError> {
    if *cursor >= data.len() {
        return Ok(None);
    }
    let mut result = 0u64;
    let mut shift = 0u32;
    loop {
        if *cursor >= data.len() {
            return Err(MCDFError::K4osLegacy("unexpected end of stream while reading varint".to_string()));
        }
        let byte = data[*cursor];
        *cursor += 1;
        result |= ((byte & 0x7f) as u64) << shift;
        if (byte & 0x80) == 0 {
            return Ok(Some(result));
        }
        shift += 7;
        if shift >= 64 {
            return Err(MCDFError::K4osLegacy("varint exceeded 64 bits".to_string()));
        }
    }
}

fn write_varint(output: &mut Vec<u8>, mut value: u64) {
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        output.push(byte);
        if value == 0 {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minimal_mcdf() {
        let metadata = MareCharaFileData {
            description: "test".to_string(),
            glamourer_data: String::new(),
            customize_plus_data: String::new(),
            manipulation_data: String::new(),
            files: vec![],
            file_swaps: vec![],
        };

        let json = serde_json::to_vec(&metadata).unwrap();
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"MCDF");
        bytes.push(1);
        bytes.extend_from_slice(&(json.len() as u32).to_le_bytes());
        bytes.extend_from_slice(&json);

        let parsed = MCDFParser::parse_package_from_slice(&bytes).unwrap();
        assert_eq!(parsed.metadata.description, "test");
        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.container_encoding, CONTAINER_RAW);
    }

    #[test]
    fn k4os_legacy_roundtrip() {
        let data = b"MCDF\x01\x02\x00\x00\x00{}";
        let compressed = k4os_legacy_compress(data);
        let decompressed = k4os_legacy_decompress(&compressed).unwrap();
        assert_eq!(decompressed, data);
    }
}
