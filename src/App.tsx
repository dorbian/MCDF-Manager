import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type MouseEvent,
} from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";

type Tab =
  | "marketplace"
  | "published"
  | "library"
  | "prepare"
  | "inspect"
  | "settings"
  | "admin";
type OperationKind = "upload" | "download" | "scan" | "build";
type OperationStatus = "running" | "done" | "failed";

type OperationStage = {
  percent: number;
  label: string;
  detail?: string;
};

type Operation = {
  id: string;
  kind: OperationKind;
  label: string;
  status: OperationStatus;
  startedAt: number;
  endedAt?: number;
  bytesDone?: number;
  bytesTotal?: number;
  message?: string;
  stage?: OperationStage;
};

type FileEntry = { game_paths: string[]; length: number; hash: string };
type MCDFInfo = {
  description: string;
  glamourer_data: string;
  customize_plus_data: string;
  manipulation_data: string;
  files: FileEntry[];
};
type ExtractedFileInfo = {
  index: number;
  game_paths: string[];
  length: number;
  hash: string;
  offset: number;
  blake3: string;
};
type McdfAnalyzeResult = {
  metadata: MCDFInfo;
  files: ExtractedFileInfo[];
};
type AnalyzedFileInfo = ExtractedFileInfo & {
  online_status?: string;
  central_status?: ComponentCentralStatus;
  notes?: string[];
};
type AnalyzeProgress = {
  percent: number;
  title: string;
  detail: string;
  known?: number;
  missing?: number;
  total?: number;
};
type FileProbeAvailability = {
  payload_blake3: string;
  length: number;
  game_paths: string[];
  upload_url?: string | null;
  direct_blob_url?: string | null;
  oci_ref?: string | null;
  oci_digest?: string | null;
};
type FileProbeResponse = {
  known_files: FileProbeAvailability[];
  missing_files: FileProbeAvailability[];
};
type ComponentCentralStatus =
  | "unknown"
  | "present"
  | "missing"
  | "queued"
  | "external_only";
type ComponentAvailability = {
  index: number;
  game_paths: string[];
  length: number;
  mcdf_hash: string;
  payload_blake3: string;
  central_status: ComponentCentralStatus;
  online_status: string;
  notes: string[];
};
type CentralServerHealth = {
  status: string;
  public_url: string;
  storage_mode: string;
  ghcr_configured: boolean;
  uploads_require_auth: boolean;
  uploads_require_registered_user?: boolean | null;
  admin_token_configured?: boolean | null;
  service_port?: number | null;
  hosted_auth_mode?: string | null;
  ca_id?: string | null;
  client_certificates_supported?: boolean | null;
};

type ArchiveConfigResponse = {
  schema_version: number;
  service_name: string;
  api_version: string;
  generated_at: string;
  server: {
    public_url?: string;
    service_port?: number;
    parser_revision?: number;
    hosted_auth_mode?: string;
  };
  uploads: {
    enabled?: boolean;
    requires_token?: boolean;
    requires_registered_user?: boolean;
    admin_token_accepted?: boolean;
    auth_model?: string;
    max_upload_mb?: number;
    preferred_flow?: string;
    endpoints?: Record<string, string>;
  };
  storage: {
    mode?: string;
    direct_downloads?: boolean;
    ghcr_owner?: string | null;
    file_parts_ref?: string | null;
    package_manifests_ref?: string | null;
  };
  public_index: {
    enabled?: boolean;
    repo?: string;
    branch?: string;
    latest_url?: string | null;
    local_dir?: string | null;
  };
  catalog: { endpoint?: string; local_database_dir?: string };
  identity: {
    publisher_registration?: string;
    client_keys_supported?: boolean;
    current_local_owner_id?: string;
    current_publisher_id?: string;
    identity_endpoint?: string;
    registration_endpoint?: string;
    notes?: string[];
    certificate_authority?: {
      enabled?: boolean;
      ca_id?: string;
      ca_name?: string;
      ca_public_key?: string;
      ca_status_endpoint?: string;
      client_certificate_endpoint?: string;
      notes?: string[];
    };
  };
  notes: string[];
};

type PublicIndexDiagnosticCheck = { name: string; ok: boolean; detail: string };
type PublicIndexDiagnosticsResponse = {
  enabled: boolean;
  repo: string;
  branch: string;
  index_dir?: string | null;
  public_dir?: string | null;
  git_available: boolean;
  git_version?: string | null;
  credential_helper?: string | null;
  credential_manager_version?: string | null;
  token_auth_configured: boolean;
  token_auth_source?: string | null;
  ssh_auth_configured: boolean;
  ssh_key_file?: string | null;
  ssh_key_exists: boolean;
  auth_method: string;
  worktree_exists: boolean;
  worktree_initialized: boolean;
  origin_url?: string | null;
  current_branch?: string | null;
  head?: string | null;
  dirty: boolean;
  latest_index_exists: boolean;
  package_count: number;
  file_metadata_count: number;
  checks: PublicIndexDiagnosticCheck[];
  notes: string[];
};

type PublicIndexPackageSummary = {
  package_hash_blake3: string;
  original_filename: string;
  title?: string;
  description: string;
  tags?: string[];
  preview_image_available?: boolean;
  preview_image_path?: string | null;
  is_adult?: boolean;
  visibility?: string | null;
  owner_display_name: string;
  owner_public_id: string;
  file_count: number;
  total_file_bytes: number;
  component_kinds: string[];
  package_manifest_path: string;
  download_manifest_path: string;
  updated_at: string;
};

type IndexSshKeyResult = {
  ssh_dir: string;
  private_key_file: string;
  public_key_file: string;
  public_key?: string | null;
  created: boolean;
  notes: string[];
};

type IndexSshTestResult = {
  ssh_key_file: string;
  remote: string;
  ok: boolean;
  exit_code?: number | null;
  stdout: string;
  stderr: string;
  notes: string[];
};

type GenerateAdminTokenResponse = {
  generated_at: string;
  token: string;
  token_file?: string | null;
  label?: string | null;
  notes?: string[];
};

type PublicIndexLatest = {
  schema_version: number;
  generated_at: string;
  package_count: number;
  packages: PublicIndexPackageSummary[];
};

type PublisherIdentityRecord = {
  schema_version: number;
  publisher_id: string;
  username?: string | null;
  display_name: string;
  public_key?: string | null;
  certificate?: string | null;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
  notes: string[];
};

type ClientAuthExportPackage = {
  schema_version: number;
  package_kind: "mcdf-client-auth";
  exported_at: string;
  archive_host?: string | null;
  archive_endpoint?: string | null;
  publisher_id: string;
  username?: string | null;
  display_name: string;
  public_key: string;
  private_key: string;
  certificate: string;
  ca_id?: string | null;
  notes: string[];
};

type PublicPackageRecord = {
  schema_version: number;
  generated_at: string;
  package_hash_blake3: string;
  original_filename: string;
  title?: string;
  description: string;
  tags?: string[];
  preview_image_available?: boolean;
  preview_image_path?: string | null;
  is_adult?: boolean;
  visibility?: string | null;
  owner: { display_name?: string; public_id?: string };
  parser_revision: number;
  parser_status: string;
  rebuild_strategy: string;
  container_encoding: string;
  validation: {
    decoded_content_identical?: boolean;
    file_payloads_hash_verified?: boolean;
    file_payload_count?: number;
  };
  file_count: number;
  total_file_bytes: number;
  files: Array<{
    index?: number;
    payload_blake3?: string;
    length?: number;
    game_paths?: string[];
    component_kind?: string;
    display_name?: string;
    ghcr_ref?: string | null;
    ghcr_digest?: string | null;
  }>;
  ghcr_manifest_ref?: string | null;
};

type ArchiveDownloadResult = {
  output_path: string;
  bytes_written: number;
  package_hash_blake3: string;
};

type ExportLocalMcdfResult = {
  source_path: string;
  output_path: string;
  bytes_written: number;
};

type CacheClearResult = {
  cache_dir: string;
  removed_dirs: string[];
  notes: string[];
};

type StorageSettingsResponse = {
  schema_version: number;
  initialized: boolean;
  settings_file: string;
  app_home_dir: string;
  library_dir: string;
  exchange_cache_dir: string;
  downloads_dir: string;
  admin_token?: string | null;
  notes: string[];
};

type StorageSettingsUpdateRequest = {
  library_dir?: string | null;
  exchange_cache_dir?: string | null;
  downloads_dir?: string | null;
  initialized?: boolean | null;
  admin_token?: string | null;
};

type ExchangePackageCacheInspection = {
  package_hash_blake3: string;
  file_count: number;
  cached_count: number;
  missing_count: number;
  cached_bytes: number;
  total_bytes: number;
  gap_percent: number;
  cache_dir: string;
  notes: string[];
};

type CentralUploadResponse = {
  package_hash_blake3: string;
  package_size: number;
  file_count: number;
  archived_file_count: number;
  deduplicated_file_count: number;
  manifest_url: string;
  download_url: string;
  storage_mode: string;
  ownership?: {
    owner_user_id?: string;
    owner_display_name?: string;
    owner_source?: string;
    visibility?: string;
  } | null;
  validation?: {
    decoded_content_identical?: boolean;
    file_payloads_hash_verified?: boolean;
    outer_byte_identical?: boolean;
  } | null;
  notes: string[];
};

type AccessRequestNotification = {
  id: string;
  package_hash_blake3?: string | null;
  package_title?: string | null;
  owner_public_id?: string | null;
  owner_display_name?: string | null;
  requester_display_name: string;
  requester_id?: string | null;
  requested_at: string;
  updated_at?: string | null;
  status: "pending" | "approved" | "denied";
  note?: string | null;
  decision_note?: string | null;
};

type AccessRequestListResponse = {
  schema_version: number;
  generated_at: string;
  request_count: number;
  requests: AccessRequestNotification[];
  notes: string[];
};

type ReportRecord = {
  id: string;
  package_hash_blake3: string;
  package_title?: string | null;
  reporter_display_name: string;
  reason: string;
  note?: string | null;
  status: "open" | "reviewed" | "removed" | "dismissed";
  created_at: string;
  updated_at?: string | null;
};
type ReportListResponse = {
  schema_version: number;
  generated_at: string;
  report_count: number;
  reports: ReportRecord[];
  notes: string[];
};
type UserPermissionRecord = {
  publisher_id: string;
  username?: string | null;
  display_name: string;
  public_key?: string | null;
  certificate?: string | null;
  certificate_revoked?: boolean;
  certificate_revoked_at?: string | null;
  can_connect: boolean;
  can_upload: boolean;
  is_admin: boolean;
  status: string;
  updated_at?: string | null;
};

type AdminServerSettings = {
  schema_version: number;
  upload_mode: "public" | "registered" | string;
  require_upload_token: boolean;
  public_index_enabled: boolean;
  public_index_include_private: boolean;
  updated_at: string;
  restart_required: boolean;
  notes?: string[];
};
type UserPermissionListResponse = {
  user_count: number;
  users: UserPermissionRecord[];
  notes: string[];
};

type PublicPublisherIndex = {
  schema_version: number;
  generated_at: string;
  publisher_count: number;
  publishers: PublisherIdentityRecord[];
};

type ModerationBlockEntry = {
  schema_version: number;
  target_type: string;
  hash_blake3: string;
  reason: string;
  category: string;
  source_package_hash?: string | null;
  created_at: string;
  created_by: string;
};

type ModerationBlocklistResponse = {
  schema_version: number;
  generated_at: string;
  package_block_count: number;
  file_block_count: number;
  entries: ModerationBlockEntry[];
  notes: string[];
};

type LocalFileManifestEntry = {
  index: number;
  game_paths: string[];
  length: number;
  payload_blake3: string;
};
type LocalSharingStatus = "allowed" | "blocked";
type LocalSharingClassification =
  | "allowed"
  | "restricted"
  | "blocked_by_policy"
  | "potentially_illegal";
type LocalModerationMatch = {
  target_type: "package" | "file";
  hash_blake3: string;
  category: string;
  reason: string;
  classification: LocalSharingClassification;
  file_path?: string | null;
  file_index?: number | null;
  file_length?: number | null;
  created_at?: string | null;
};
type LocalSharingPolicy = {
  status: LocalSharingStatus;
  classification: LocalSharingClassification;
  label: string;
  summary: string;
  checked_at?: string | null;
  matches: LocalModerationMatch[];
};

const ACCESS_NOTIFICATIONS_KEY = "mcdf.serverAccess.notifications.v1";
const ADMIN_TOKEN_KEY = "mcdf.archive.adminToken";
const LEGACY_UPLOAD_TOKEN_KEY = "mcdf.archive.uploadToken";
const EULA_VERSION = "2026-06-02-v1";
const EULA_ACCEPTED_KEY = "mcdf.eula.acceptedVersion";
const PUBLISHING_RULES_VERSION = "2026-06-02.1";
const PUBLISHING_RULES_CONTENT_ID = "publishing-rules-2026-06-02.1";
const PUBLISHING_RULES_ACCEPTED_KEY = "mcdf.publishingRules.acceptedContentId";
function hasAcceptedEula(): boolean {
  return localStorage.getItem(EULA_ACCEPTED_KEY) === EULA_VERSION;
}
function acceptEula(): void {
  localStorage.setItem(EULA_ACCEPTED_KEY, EULA_VERSION);
  window.dispatchEvent(new Event("mcdf-eula-accepted"));
}
function hasAcceptedPublishingRules(): boolean {
  return (
    localStorage.getItem(PUBLISHING_RULES_ACCEPTED_KEY) ===
    PUBLISHING_RULES_CONTENT_ID
  );
}
function acceptPublishingRules(): void {
  localStorage.setItem(
    PUBLISHING_RULES_ACCEPTED_KEY,
    PUBLISHING_RULES_CONTENT_ID,
  );
  window.dispatchEvent(new Event("mcdf-publishing-rules-accepted"));
}
function storedAdminToken(): string {
  return (
    localStorage.getItem(ADMIN_TOKEN_KEY) ||
    localStorage.getItem(LEGACY_UPLOAD_TOKEN_KEY) ||
    ""
  );
}
function archiveActionToken(): string | null {
  const token = storedAdminToken().trim();
  return token || null;
}
async function loadAdminTokenFromConfig(): Promise<string> {
  try {
    const settings = await invoke<StorageSettingsResponse>(
      "get_storage_settings",
    );
    const token = (settings.admin_token || "").trim();
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      localStorage.setItem(LEGACY_UPLOAD_TOKEN_KEY, token);
      window.dispatchEvent(new Event("mcdf-admin-token-changed"));
    }
    return token;
  } catch {
    return storedAdminToken();
  }
}
async function saveAdminToken(value: string): Promise<void> {
  const token = value.trim();
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    localStorage.setItem(LEGACY_UPLOAD_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(LEGACY_UPLOAD_TOKEN_KEY);
  }
  try {
    await invoke<StorageSettingsResponse>("save_storage_settings", {
      update: { admin_token: token },
    });
  } catch (error) {
    console.warn("admin token config save failed", error);
  }
  window.dispatchEvent(new Event("mcdf-admin-token-changed"));
}
function readAccessNotifications(): AccessRequestNotification[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(ACCESS_NOTIFICATIONS_KEY) || "[]",
    );
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeAccessNotifications(requests: AccessRequestNotification[]) {
  localStorage.setItem(ACCESS_NOTIFICATIONS_KEY, JSON.stringify(requests));
}

type LocalLibrarySettings = {
  libraryViewMode: BrowserDisplayMode;
  exchangeViewMode: BrowserDisplayMode;
  adultContentMode: AdultContentMode;
  dateDisplayMode: DateDisplayMode;
};
const LOCAL_LIBRARY_SETTINGS_KEY = "mcdf.localLibrary.settings.v1";
function readLibrarySettings(): LocalLibrarySettings {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(LOCAL_LIBRARY_SETTINGS_KEY) || "{}",
    );
    return {
      libraryViewMode: parsed.libraryViewMode === "cards" ? "cards" : "list",
      exchangeViewMode: parsed.exchangeViewMode === "list" ? "list" : "cards",
      adultContentMode: parsed.adultContentMode === "show" ? "show" : "hide",
      dateDisplayMode: ["dmy", "ymd", "mdy", "iso"].includes(
        parsed.dateDisplayMode,
      )
        ? parsed.dateDisplayMode
        : "dmy",
    };
  } catch {
    return {
      libraryViewMode: "list",
      exchangeViewMode: "cards",
      adultContentMode: "hide",
      dateDisplayMode: "dmy",
    };
  }
}
function writeLibrarySettings(settings: LocalLibrarySettings) {
  localStorage.setItem(LOCAL_LIBRARY_SETTINGS_KEY, JSON.stringify(settings));
}
const STORAGE_SETUP_ACK_KEY = "mcdf.storageSetup.ack.v1";
function storageSetupAcknowledged(): boolean {
  return localStorage.getItem(STORAGE_SETUP_ACK_KEY) === "yes";
}
function acknowledgeStorageSetup() {
  localStorage.setItem(STORAGE_SETUP_ACK_KEY, "yes");
}
function isAdultByTags(tags?: string[]): boolean {
  return Boolean(
    (tags || []).some((tag) =>
      ["18+", "nsfw", "adult", "explicit"].includes(tag.toLowerCase()),
    ),
  );
}
function entryIsAdult(
  entry: Pick<LocalMcdfEntry, "is_adult" | "tags">,
): boolean {
  return Boolean(entry.is_adult || isAdultByTags(entry.tags));
}
function packageIsAdult(
  pkg:
    | Pick<PublicIndexPackageSummary, "is_adult" | "tags">
    | Pick<PublicPackageRecord, "is_adult" | "tags">,
): boolean {
  return Boolean(
    (pkg as { is_adult?: boolean; tags?: string[] }).is_adult ||
    isAdultByTags((pkg as { tags?: string[] }).tags),
  );
}

function displayImageSrc(image?: string | null): string | null {
  if (!image) return null;
  const trimmed = image.trim();
  if (!trimmed) return null;
  if (/^(https?:|data:|blob:|asset:|tauri:)/i.test(trimmed)) return trimmed;
  return convertFileSrc(trimmed);
}

type RemoteMcdfScanResult = {
  source_url: string;
  original_filename: string;
  title: string;
  description: string;
  package_hash_blake3: string;
  package_size: number;
  file_count: number;
  total_file_bytes: number;
  component_kinds: string[];
  notes: string[];
};
type LocalMcdfSourceType =
  | "local_file"
  | "google_drive"
  | "direct_url"
  | "indexed";
type LocalMcdfStorageState =
  | "offline"
  | "server"
  | "online"
  | "subscribed"
  | "removed"
  | "failed";
type McdfVisibility = "public" | "locked" | "private";
type BrowserDisplayMode = "list" | "cards";
type AdultContentMode = "hide" | "show";
type DateDisplayMode = "dmy" | "ymd" | "mdy" | "iso";
type LocalMcdfEntry = {
  id: string;
  local_path: string;
  source_type?: LocalMcdfSourceType;
  source_url?: string | null;
  source_label?: string | null;
  remote_annotation?: string | null;
  missing_registry_percent?: number | null;
  original_filename: string;
  title: string;
  description: string;
  tags: string[];
  preview_image_path?: string | null;
  is_adult?: boolean;
  visibility?: McdfVisibility;
  package_hash_blake3?: string | null;
  file_count: number;
  total_file_bytes: number;
  component_kinds: string[];
  file_manifest?: LocalFileManifestEntry[];
  sharing_policy?: LocalSharingPolicy | null;
  storage_state: LocalMcdfStorageState;
  last_checked_at?: string | null;
  last_published_at?: string | null;
  manifest_url?: string | null;
  download_url?: string | null;
  notes: string[];
};

type McdfAddDraft = {
  path: string;
  fileName: string;
  info: MCDFInfo;
  files: ExtractedFileInfo[];
  title: string;
  description: string;
  tags: string;
  previewPath: string | null;
  isAdult: boolean;
  visibility: McdfVisibility;
  sourceType?: LocalMcdfSourceType;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  remoteAnnotation?: string | null;
  packageHash?: string | null;
  fileCount?: number;
  totalBytes?: number;
  componentKinds?: string[];
  notes?: string[];
};

type FileLike = AnalyzedFileInfo | ComponentAvailability;

type PanelProps = {
  addOperation: (op: Omit<Operation, "id" | "startedAt" | "status">) => string;
  finishOperation: (id: string, patch: Partial<Operation>) => void;
  updateOperation: (id: string, patch: Partial<Operation>) => void;
};

const navSections: Array<{
  title: string;
  items: Array<{ id: Tab; label: string; icon: string; hint: string }>;
}> = [
  {
    title: "INDEX",
    items: [
      {
        id: "library",
        label: "LIBRARY",
        icon: "⌁",
        hint: "Local and subscribed entries",
      },
      {
        id: "published",
        label: "The Eorzea Exchange",
        icon: "✧",
        hint: "Search the registry",
      },
    ],
  },
  {
    title: "Advanced",
    items: [{ id: "prepare", label: "Analyze MCDF", icon: "◇", hint: "" }],
  },
  {
    title: "System",
    items: [
      {
        id: "settings",
        label: "Settings",
        icon: "⚙",
        hint: "Cache and build info",
      },
      {
        id: "admin",
        label: "Admin",
        icon: "✦",
        hint: "Moderation and ownership",
      },
    ],
  },
];

const DEFAULT_ARCHIVE_HOST =
  import.meta.env.VITE_DEFAULT_ARCHIVE_HOST || "http://mcdf.thebigtree.life";
const SHARED_ARCHIVE_HOST =
  localStorage.getItem("mcdf.archive.host") || DEFAULT_ARCHIVE_HOST;

function configuredArchiveHost(): string {
  return localStorage.getItem("mcdf.archive.host") || SHARED_ARCHIVE_HOST;
}

function displayNameToUsername(value: string): string {
  return (
    (value || "publisher")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "publisher"
  );
}

function formatDate(
  value?: string | null,
  mode: DateDisplayMode = readLibrarySettings().dateDisplayMode,
): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  if (mode === "iso") return parsed.toISOString().slice(0, 10);
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear());
  if (mode === "ymd") return `${year}-${month}-${day}`;
  if (mode === "mdy") return `${month}-${day}-${year}`;
  return `${day}-${month}-${year}`;
}

function formatBytes(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
function shortHash(value?: string | null): string {
  if (!value) return "—";
  return value.length <= 18
    ? value
    : `${value.slice(0, 10)}…${value.slice(-8)}`;
}
function hasStoredClientAuth(): boolean {
  return Boolean(
    localStorage.getItem("mcdf.publisher.privateKey.pkcs8") &&
    localStorage.getItem("mcdf.publisher.publicKey.spki") &&
    localStorage.getItem("mcdf.publisher.certificate"),
  );
}
function storedPublisherDisplayName(): string {
  return (
    localStorage.getItem("mcdf.publisher.displayName") ||
    localStorage.getItem("mcdf.publisher.username") ||
    "Not Registered"
  );
}
function storedPublisherPermissions(
  connected: boolean,
  authorized: boolean,
): string {
  if (!authorized) return "";
  const isAdmin = Boolean(storedAdminToken().trim());
  const role = isAdmin ? "Admin · publisher" : "Publisher";
  return connected ? `${role} · connected` : `${role} · ready`;
}

function readPublicProfile() {
  return {
    displayName: localStorage.getItem("mcdf.publisher.displayName") || "",
    username: localStorage.getItem("mcdf.publisher.username") || "",
    flair: localStorage.getItem("mcdf.publisher.flair") || "",
    website: localStorage.getItem("mcdf.publisher.website") || "",
    image: localStorage.getItem("mcdf.publisher.profileImage") || "",
    registeredAt: localStorage.getItem("mcdf.publisher.registeredAt") || "",
    publicKey: localStorage.getItem("mcdf.publisher.publicKey.spki") || "",
    certificate: localStorage.getItem("mcdf.publisher.certificate") || "",
  };
}

function savePublicProfile(profile: ReturnType<typeof readPublicProfile>) {
  localStorage.setItem(
    "mcdf.publisher.displayName",
    profile.displayName.trim(),
  );
  localStorage.setItem(
    "mcdf.publisher.username",
    (
      profile.username.trim() ||
      displayNameToUsername(profile.displayName || "publisher")
    ).toLowerCase(),
  );
  localStorage.setItem("mcdf.publisher.flair", profile.flair.trim());
  localStorage.setItem("mcdf.publisher.website", profile.website.trim());
  localStorage.setItem("mcdf.publisher.profileImage", profile.image.trim());
  if (!profile.registeredAt && hasStoredClientAuth())
    localStorage.setItem(
      "mcdf.publisher.registeredAt",
      new Date().toISOString(),
    );
  window.dispatchEvent(new Event("mcdf-client-auth-changed"));
}

function localPublisherAuthHeaders() {
  return {
    publisherId:
      localStorage.getItem("mcdf.publisher.username") ||
      localStorage.getItem("mcdf.publisher.displayName") ||
      null,
    publisherDisplayName:
      localStorage.getItem("mcdf.publisher.displayName") ||
      localStorage.getItem("mcdf.publisher.username") ||
      null,
    publisherPublicKey:
      localStorage.getItem("mcdf.publisher.publicKey.spki") || null,
    publisherCertificate:
      localStorage.getItem("mcdf.publisher.certificate") || null,
  };
}
function serviceLockedMessage(connected: boolean): string | null {
  return connected
    ? null
    : "Connect to the archive server to use this server-side action.";
}
const CREATOR_SUBSCRIPTIONS_KEY = "mcdf.exchange.creatorSubscriptions.v1";
const PACKAGE_SUBSCRIPTIONS_KEY = "mcdf.exchange.packageSubscriptions.v1";
function readCreatorSubscriptions(): string[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(CREATOR_SUBSCRIPTIONS_KEY) || "[]",
    );
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeCreatorSubscriptions(ids: string[]) {
  localStorage.setItem(CREATOR_SUBSCRIPTIONS_KEY, JSON.stringify(ids));
}
function readPackageSubscriptions(): string[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(PACKAGE_SUBSCRIPTIONS_KEY) || "[]",
    );
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writePackageSubscriptions(ids: string[]) {
  localStorage.setItem(PACKAGE_SUBSCRIPTIONS_KEY, JSON.stringify(ids));
}
type PackageSubscriptionSnapshot = {
  package_hash_blake3: string;
  subscribed_at: string;
  original_filename: string;
  title: string;
  description?: string;
  tags?: string[];
  preview_image_path?: string | null;
  is_adult?: boolean;
  visibility?: McdfVisibility;
  owner_public_id?: string | null;
  owner_display_name?: string | null;
  file_count: number;
  total_file_bytes: number;
  component_kinds?: string[];
  package_manifest_path?: string | null;
  download_manifest_path?: string | null;
  updated_at?: string | null;
};
const PACKAGE_SUBSCRIPTION_SNAPSHOTS_KEY =
  "mcdf.exchange.packageSubscriptionSnapshots.v1";
function readPackageSubscriptionSnapshots(): Record<
  string,
  PackageSubscriptionSnapshot
> {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(PACKAGE_SUBSCRIPTION_SNAPSHOTS_KEY) || "{}",
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}
function writePackageSubscriptionSnapshots(
  snapshots: Record<string, PackageSubscriptionSnapshot>,
) {
  localStorage.setItem(
    PACKAGE_SUBSCRIPTION_SNAPSHOTS_KEY,
    JSON.stringify(snapshots),
  );
}
function packageSnapshotFromIndex(
  pkg: PublicIndexPackageSummary | PublicPackageRecord,
): PackageSubscriptionSnapshot {
  const summary = pkg as PublicIndexPackageSummary;
  const record = pkg as PublicPackageRecord;
  return {
    package_hash_blake3: pkg.package_hash_blake3,
    subscribed_at: new Date().toISOString(),
    original_filename: pkg.original_filename,
    title: pkg.title || pkg.original_filename,
    description: pkg.description || "",
    tags: pkg.tags || [],
    preview_image_path: pkg.preview_image_path || null,
    is_adult: Boolean(pkg.is_adult),
    visibility: (pkg.visibility as McdfVisibility) || "public",
    owner_public_id: summary.owner_public_id || record.owner?.public_id || null,
    owner_display_name:
      summary.owner_display_name || record.owner?.display_name || null,
    file_count: pkg.file_count || 0,
    total_file_bytes: pkg.total_file_bytes || 0,
    component_kinds: summary.component_kinds || [],
    package_manifest_path: summary.package_manifest_path || null,
    download_manifest_path: summary.download_manifest_path || null,
    updated_at: summary.updated_at || null,
  };
}
function rememberPackageSubscriptionSnapshot(
  pkg: PublicIndexPackageSummary | PublicPackageRecord,
) {
  const snapshots = readPackageSubscriptionSnapshots();
  snapshots[pkg.package_hash_blake3] = packageSnapshotFromIndex(pkg);
  writePackageSubscriptionSnapshots(snapshots);
}
function removePackageSubscriptionSnapshot(packageHash: string) {
  const snapshots = readPackageSubscriptionSnapshots();
  if (snapshots[packageHash]) {
    delete snapshots[packageHash];
    writePackageSubscriptionSnapshots(snapshots);
  }
}
type CreatorPackageIdentity = {
  owner_public_id?: string | null;
  owner_display_name?: string | null;
  owner?: { public_id?: string | null; display_name?: string | null } | null;
};
function creatorKeyFromPackage(pkg: CreatorPackageIdentity): string {
  return (
    pkg.owner_public_id ||
    pkg.owner?.public_id ||
    pkg.owner_display_name ||
    pkg.owner?.display_name ||
    "unknown"
  );
}
function creatorLabelFromPackage(pkg: CreatorPackageIdentity): string {
  return (
    pkg.owner_display_name ||
    pkg.owner?.display_name ||
    pkg.owner_public_id ||
    pkg.owner?.public_id ||
    "Unknown creator"
  );
}
const LOCAL_LIBRARY_STORAGE_KEY = "mcdf.localLibrary.entries.v1";
function readLocalMcdfLibrary(): LocalMcdfEntry[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(LOCAL_LIBRARY_STORAGE_KEY) || "[]",
    );
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeLocalMcdfLibrary(entries: LocalMcdfEntry[]) {
  localStorage.setItem(LOCAL_LIBRARY_STORAGE_KEY, JSON.stringify(entries));
}
function localEntryId(path: string): string {
  return `local-${btoa(unescape(encodeURIComponent(path)))
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 32)}`;
}
function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
function stateLabel(state: LocalMcdfStorageState): string {
  if (state === "online") return "online";
  if (state === "server") return "not listed";
  if (state === "subscribed") return "not downloaded";
  if (state === "removed") return "removed from Exchange";
  if (state === "failed") return "needs attention";
  return "on device";
}
function visibilityLabel(visibility?: McdfVisibility): string {
  if (visibility === "locked") return "locked";
  if (visibility === "private") return "private";
  return "public";
}
function visibilityClass(visibility?: McdfVisibility): string {
  if (visibility === "locked") return "status-warn";
  if (visibility === "private") return "status-bad";
  return "status-good";
}
function stateClass(state: LocalMcdfStorageState): string {
  if (state === "online") return "status-good";
  if (state === "server") return "status-warn";
  if (state === "subscribed") return "status-warn";
  if (state === "removed") return "status-bad";
  if (state === "failed") return "status-bad";
  return "status-neutral";
}
function kindsFromExtractedFiles(files: ExtractedFileInfo[]): string[] {
  return Array.from(
    new Set(files.map((file) => inferComponentKind(file)).filter(Boolean)),
  ).slice(0, 8);
}
function sourceLabel(entry: LocalMcdfEntry): string {
  if (entry.source_type === "google_drive") return "Google Drive source";
  if (entry.source_type === "direct_url") return "Remote source";
  if (entry.source_type === "indexed")
    return entry.storage_state === "removed"
      ? "Removed Exchange item"
      : entry.storage_state === "subscribed"
        ? "Subscribed Exchange item"
        : "Index-only source";
  return "Device file";
}
function compactSourceLabel(entry: LocalMcdfEntry): string {
  if (entry.source_type === "google_drive") return "Google Drive";
  if (entry.source_type === "direct_url") return "Remote";
  if (entry.source_type === "indexed") return "Index";
  return "Device";
}
function packageLabelsFromKinds(kinds?: string[]): string[] {
  return Array.from(new Set((kinds || []).filter(Boolean))).slice(0, 8);
}
function fileManifestFromExtractedFiles(
  files: ExtractedFileInfo[],
): LocalFileManifestEntry[] {
  return files.map((file) => ({
    index: file.index,
    game_paths: file.game_paths || [],
    length: file.length,
    payload_blake3: file.blake3,
  }));
}
function sharingClassificationFromBlockCategory(
  category?: string | null,
): LocalSharingClassification {
  const value = (category || "").toLowerCase();
  if (/illegal|minor|age-ambiguous|malware|abuse|privacy|doxxing/.test(value))
    return "potentially_illegal";
  if (/copyright|paid|creator|proprietary|rights/.test(value))
    return "restricted";
  return "blocked_by_policy";
}
function sharingClassificationLabel(
  classification: LocalSharingClassification,
): string {
  if (classification === "potentially_illegal") return "Potentially illegal";
  if (classification === "restricted") return "Restricted";
  if (classification === "blocked_by_policy") return "Blocked by policy";
  return "Can share";
}
function sharingClassificationClass(
  classification: LocalSharingClassification,
): string {
  if (classification === "potentially_illegal") return "status-bad";
  if (classification === "blocked_by_policy") return "status-bad";
  if (classification === "restricted") return "status-warn";
  return "status-neutral";
}
function sharingPolicyClass(policy?: LocalSharingPolicy | null): string {
  return sharingClassificationClass(policy?.classification || "allowed");
}
function sharingPolicyLabel(
  entry: Pick<LocalMcdfEntry, "sharing_policy">,
): string {
  return entry.sharing_policy?.status === "blocked"
    ? "Disallowed"
    : "Can share";
}
function sharingPolicyDetailLabel(
  entry: Pick<LocalMcdfEntry, "sharing_policy">,
): string {
  return entry.sharing_policy?.label || "No sharing block";
}
function sharingReasonFile(
  entry: Pick<LocalMcdfEntry, "sharing_policy">,
): string {
  const match =
    entry.sharing_policy?.matches?.find(
      (item) => item.target_type === "file",
    ) || entry.sharing_policy?.matches?.[0];
  if (!entry.sharing_policy || entry.sharing_policy.status === "allowed")
    return "—";
  if (!match) return "Policy block";
  if (match.target_type === "package")
    return `Package ${shortHash(match.hash_blake3)}`;
  return `${match.file_path || "Unknown file"} · ${shortHash(match.hash_blake3)}`;
}
function sharingPolicyForEntry(
  entry: LocalMcdfEntry,
  blocklist: ModerationBlocklistResponse,
  checkedAt = new Date().toISOString(),
): LocalSharingPolicy {
  const packageBlocks = new Map<string, ModerationBlockEntry>();
  const fileBlocks = new Map<string, ModerationBlockEntry>();
  for (const block of blocklist.entries || []) {
    const target = (block.target_type || "").toLowerCase();
    if (target === "package") packageBlocks.set(block.hash_blake3, block);
    if (target === "file" || target === "layer")
      fileBlocks.set(block.hash_blake3, block);
  }
  const matches: LocalModerationMatch[] = [];
  if (
    entry.package_hash_blake3 &&
    packageBlocks.has(entry.package_hash_blake3)
  ) {
    const block = packageBlocks.get(entry.package_hash_blake3)!;
    const classification = sharingClassificationFromBlockCategory(
      block.category,
    );
    matches.push({
      target_type: "package",
      hash_blake3: block.hash_blake3,
      category: block.category,
      reason: block.reason,
      classification,
      file_path: null,
      file_index: null,
      file_length: null,
      created_at: block.created_at,
    });
  }
  for (const file of entry.file_manifest || []) {
    const block = fileBlocks.get(file.payload_blake3);
    if (!block) continue;
    const classification = sharingClassificationFromBlockCategory(
      block.category,
    );
    matches.push({
      target_type: "file",
      hash_blake3: block.hash_blake3,
      category: block.category,
      reason: block.reason,
      classification,
      file_path: file.game_paths?.[0] || null,
      file_index: file.index,
      file_length: file.length,
      created_at: block.created_at,
    });
  }
  if (matches.length === 0) {
    return {
      status: "allowed",
      classification: "allowed",
      label: "Can share",
      summary: "No moderation block matched the package or stored file hashes.",
      checked_at: checkedAt,
      matches: [],
    };
  }
  const strongest = matches.some(
    (match) => match.classification === "potentially_illegal",
  )
    ? "potentially_illegal"
    : matches.some((match) => match.classification === "blocked_by_policy")
      ? "blocked_by_policy"
      : "restricted";
  return {
    status: "blocked",
    classification: strongest,
    label: sharingClassificationLabel(strongest),
    summary: `${matches.length} moderation ${matches.length === 1 ? "match" : "matches"} block sharing or upload.`,
    checked_at: checkedAt,
    matches,
  };
}
function localEntryManualTags(entry: Pick<LocalMcdfEntry, "tags">): string[] {
  return Array.from(new Set((entry.tags || []).filter(Boolean))).slice(0, 8);
}
function localEntrySystemLabels(
  entry: Pick<LocalMcdfEntry, "component_kinds" | "sharing_policy">,
): string[] {
  const labels = packageLabelsFromKinds(entry.component_kinds);
  if (entry.sharing_policy && entry.sharing_policy.classification !== "allowed")
    labels.unshift(entry.sharing_policy.label);
  return Array.from(new Set(labels)).slice(0, 10);
}
function exchangePackageTags(
  pkg:
    | Pick<PublicIndexPackageSummary, "tags">
    | Pick<PublicPackageRecord, "tags">,
): string[] {
  return Array.from(
    new Set(((pkg as { tags?: string[] }).tags || []).filter(Boolean)),
  ).slice(0, 8);
}
function exchangePackageLabels(
  pkg: Pick<PublicIndexPackageSummary, "component_kinds"> | PublicPackageRecord,
): string[] {
  if ("component_kinds" in pkg)
    return packageLabelsFromKinds(pkg.component_kinds);
  return packageLabelsFromKinds(
    Array.from(
      new Set(
        pkg.files
          .map((file) => file.component_kind || "Component")
          .filter(Boolean),
      ),
    ),
  );
}
function friendlyPublishNotes(entry: LocalMcdfEntry): string[] {
  if (entry.sharing_policy && entry.sharing_policy.status !== "allowed")
    return [`${entry.sharing_policy.label}: ${entry.sharing_policy.summary}`];
  if (entry.storage_state === "failed")
    return [
      "Publishing needs attention. Open the connection settings and try publishing again.",
    ];
  if (!entry.last_published_at && entry.notes.length === 0) return [];
  const notes = entry.notes.join(" ").toLowerCase();
  const result: string[] = [];
  if (entry.last_published_at)
    result.push(`Last published ${formatDate(entry.last_published_at)}.`);
  if (entry.storage_state === "online")
    result.push("Visible in The Eorzea Exchange public index.");
  if (entry.storage_state === "server")
    result.push(
      "Saved locally/server-side but not currently listed in The Eorzea Exchange.",
    );
  if (/index sync failed|sync failed|push failed/.test(notes))
    result.push(
      "The package was saved, but the public index did not update yet.",
    );
  if (/deduplicat|already|existing/.test(notes))
    result.push(
      "Some files were already known, so only missing parts needed handling.",
    );
  return Array.from(new Set(result)).slice(0, 4);
}
function sourceClass(entry: LocalMcdfEntry): string {
  if (entry.source_type === "local_file" || !entry.source_type)
    return "status-neutral";
  return "status-warn";
}
function isRemoteEntry(entry: LocalMcdfEntry): boolean {
  return Boolean(entry.source_url && entry.source_type !== "local_file");
}
function remoteSourceTypeFromUrl(url: string): LocalMcdfSourceType {
  return /drive\.google\.com/i.test(url) ? "google_drive" : "direct_url";
}

function notifyClientAuthChanged() {
  window.dispatchEvent(new Event("mcdf-client-auth-changed"));
}
function statusLabel(status?: string | null): string {
  if (status === "not_checked") return "not checked";
  if (status === "present") return "known";
  if (status === "missing") return "missing";
  if (status === "unknown") return "unknown";
  return (status || "not_checked").replace(/_/g, " ");
}
function filePrimaryPath(file: FileLike): string {
  return file.game_paths?.[0] || "unknown path";
}
function fileBlake3(file: FileLike): string {
  if ("payload_blake3" in file) return file.payload_blake3;
  return file.blake3;
}
function fileMcdfHash(file: FileLike): string {
  if ("mcdf_hash" in file) return file.mcdf_hash;
  return file.hash;
}
function fileOffset(file: FileLike): number | undefined {
  if ("offset" in file) return file.offset;
  return undefined;
}
function fileStatus(file: FileLike): string {
  if ("online_status" in file) return file.online_status ?? "not_checked";
  return "not_checked";
}
function fileNotes(file: FileLike): string[] {
  return "notes" in file ? (file.notes ?? []) : [];
}
function inferComponentKind(file: Pick<FileLike, "game_paths">): string {
  const joined = file.game_paths.join(" ").toLowerCase();
  if (
    joined.includes("animation") ||
    joined.endsWith(".pap") ||
    joined.endsWith(".tmb")
  )
    return "Animation";
  if (
    joined.endsWith(".tex") ||
    joined.endsWith(".atex") ||
    joined.includes("/texture/")
  )
    return "Texture";
  if (joined.endsWith(".mtrl") || joined.includes("/material/"))
    return "Material";
  if (joined.endsWith(".mdl") || joined.includes("/model/")) return "Model";
  if (joined.endsWith(".sklb") || joined.includes("skeleton"))
    return "Skeleton";
  if (joined.includes("tail")) return "Tail / Feature";
  if (joined.includes("hair")) return "Hair";
  if (joined.includes("face") || joined.includes("head")) return "Face";
  return "Other";
}
function probeComponentKind(file: ExtractedFileInfo): string {
  return (
    inferComponentKind(file)
      .toLowerCase()
      .replace(/\s*\/\s*/g, "_")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "binary"
  );
}
function guessMediaTypeFromPaths(paths: string[]): string {
  const joined = paths.join(" ").toLowerCase();
  if (joined.endsWith(".tex") || joined.endsWith(".atex"))
    return "application/x-ffxiv-texture";
  if (joined.endsWith(".mdl")) return "application/x-ffxiv-model";
  if (joined.endsWith(".mtrl")) return "application/x-ffxiv-material";
  if (joined.endsWith(".sklb")) return "application/x-ffxiv-skeleton";
  if (joined.endsWith(".pap") || joined.endsWith(".tmb"))
    return "application/x-ffxiv-animation";
  return "application/octet-stream";
}
function progressLabel(progress: AnalyzeProgress | null): string {
  if (!progress) return "Waiting for an MCDF file.";
  const counts = progress.total
    ? progress.known !== undefined || progress.missing !== undefined
      ? ` · ${progress.known ?? 0} known, ${progress.missing ?? 0} missing, ${progress.total} total`
      : ` · ${progress.total} hashes`
    : "";
  return `${progress.detail}${counts}`;
}
async function probeKnownFiles(
  files: ExtractedFileInfo[],
): Promise<FileProbeResponse | null> {
  const token = archiveActionToken();
  if (!token) return null;
  return await invoke<FileProbeResponse>("probe_mcdf_hash_manifest", {
    serverUrl: configuredArchiveHost(),
    bearerToken: token,
    files,
  });
}
function applyProbeStatus(
  files: ExtractedFileInfo[],
  probe: FileProbeResponse | null,
): AnalyzedFileInfo[] {
  if (!probe)
    return files.map((file) => ({
      ...file,
      online_status: "not_checked",
      central_status: "unknown",
      notes: [
        "Hash calculated locally. The registry has not been checked yet.",
      ],
    }));
  const known = new Set(probe.known_files.map((file) => file.payload_blake3));
  const missing = new Set(
    probe.missing_files.map((file) => file.payload_blake3),
  );
  return files.map((file) =>
    known.has(file.blake3)
      ? {
          ...file,
          online_status: "present",
          central_status: "present",
          notes: [
            "This BLAKE3 payload hash is already known by the archive server.",
          ],
        }
      : missing.has(file.blake3)
        ? {
            ...file,
            online_status: "missing",
            central_status: "missing",
            notes: [
              "This BLAKE3 payload hash is not present on the archive server yet.",
            ],
          }
        : {
            ...file,
            online_status: "unknown",
            central_status: "unknown",
            notes: [
              "The archive server did not return a status for this hash.",
            ],
          },
  );
}

function groupedFiles(files: FileLike[]): Array<{
  kind: string;
  files: FileLike[];
  bytes: number;
  online: number;
  missing: number;
  notChecked: number;
}> {
  const map = new Map<string, FileLike[]>();
  files.forEach((file) => {
    const kind = inferComponentKind(file);
    map.set(kind, [...(map.get(kind) ?? []), file]);
  });
  return Array.from(map.entries())
    .map(([kind, list]) => ({
      kind,
      files: list,
      bytes: list.reduce((sum, file) => sum + file.length, 0),
      online: list.filter((file) =>
        ["present", "cached", "online_available", "external_only"].includes(
          fileStatus(file),
        ),
      ).length,
      missing: list.filter((file) =>
        ["missing", "chunk_missing"].includes(fileStatus(file)),
      ).length,
      notChecked: list.filter((file) => fileStatus(file) === "not_checked")
        .length,
    }))
    .sort((a, b) => b.files.length - a.files.length);
}
function statusClass(status: string): string {
  if (
    ["present", "cached", "online_available", "external_only"].includes(status)
  )
    return "status-good";
  if (["queued", "unknown", "not_checked"].includes(status))
    return "status-warn";
  if (["missing", "chunk_missing"].includes(status)) return "status-bad";
  return "status-neutral";
}

function ErrorBox({ error }: { error: string | null }) {
  return error ? <div className="alert alert-error">{error}</div> : null;
}
function SuccessBox({ children }: { children: ReactNode }) {
  return <div className="alert alert-success">{children}</div>;
}
function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`glass-panel ${className}`}>{children}</section>;
}
function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button type="button" {...rest} className={`btn-primary ${className}`} />
  );
}
function GhostButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button type="button" {...rest} className={`btn-ghost ${className}`} />
  );
}
function IconButton({
  label,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      {...rest}
      aria-label={label}
      title={label}
      className={`icon-top-button ${className}`}
    >
      {children}
    </button>
  );
}
function Field(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`field ${className}`} />;
}

function ActivityIndicator({ operations }: { operations: Operation[] }) {
  const active = operations.filter((op) => op.status === "running");
  const done = operations.filter((op) => op.status === "done").length;
  const failed = operations.filter((op) => op.status === "failed").length;
  const recent = operations.slice(0, 8);
  const totalSpeed = active.reduce((sum, op) => {
    const elapsed = (Date.now() - op.startedAt) / 1000;
    return op.bytesDone && elapsed > 0 ? sum + op.bytesDone / elapsed : sum;
  }, 0);
  return (
    <details className="activity">
      <summary className="activity-summary">
        <span className={active.length > 0 ? "pulse-dot" : "idle-dot"} />
        <span>
          {active.length > 0 ? `${active.length} active` : "transfers"}
        </span>
        <span className="activity-speed">
          {active.length > 0 ? formatBytes(totalSpeed) + "/s" : `${done} done`}
        </span>
      </summary>
      <div className="activity-popover">
        <div className="activity-head">
          <span>Uploads / downloads</span>
          <span>{failed > 0 ? `${failed} failed` : "idle"}</span>
        </div>
        {recent.length === 0 ? (
          <div className="empty-small">No operations yet.</div>
        ) : (
          recent.map((op) => {
            const elapsed = ((op.endedAt ?? Date.now()) - op.startedAt) / 1000;
            const speed =
              op.bytesDone && elapsed > 0
                ? `${formatBytes(op.bytesDone / elapsed)}/s`
                : "—";
            return (
              <div key={op.id} className="activity-row">
                <div className="activity-row-title">
                  <span>{op.label}</span>
                  <span className={`status-pill ${statusClass(op.status)}`}>
                    {op.status}
                  </span>
                </div>
                <div className="activity-row-meta">
                  <span>{op.kind}</span>
                  <span>
                    {op.stage
                      ? `${op.stage.percent}%`
                      : `${formatBytes(op.bytesDone)} ${op.bytesTotal ? `/ ${formatBytes(op.bytesTotal)}` : ""} · ${speed}`}
                  </span>
                </div>
                {op.stage && (
                  <div
                    className="activity-progress-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={op.stage.percent}
                    aria-label={op.stage.label}
                  >
                    <div
                      className="activity-progress-fill"
                      style={{
                        width: `${Math.max(0, Math.min(100, op.stage.percent))}%`,
                      }}
                    />
                  </div>
                )}
                {op.message && (
                  <div className="activity-message">{op.message}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}

function ComponentSummary({ files }: { files: FileLike[] }) {
  const groups = groupedFiles(files);
  const totalBytes = files.reduce((sum, file) => sum + file.length, 0);
  return (
    <Panel>
      <div className="panel-title-row">
        <div>
          <div className="eyebrow">Component stack</div>
          <h2>Bundle contents</h2>
        </div>
        <span className="status-pill status-neutral">{files.length} files</span>
      </div>
      <div className="summary-metrics">
        <div>
          <strong>{groups.length}</strong>
          <span>groups</span>
        </div>
        <div>
          <strong>{formatBytes(totalBytes)}</strong>
          <span>payload</span>
        </div>
        <div>
          <strong>
            {files.filter((f) => fileStatus(f) !== "missing").length}
          </strong>
          <span>available/local</span>
        </div>
      </div>
      <div className="component-grid">
        {groups.length === 0 && (
          <div className="empty-small">No extracted files yet.</div>
        )}
        {groups.map((group) => (
          <div key={group.kind} className="component-card">
            <div className="component-icon">{group.kind.slice(0, 1)}</div>
            <div>
              <div className="component-name">{group.kind}</div>
              <div className="component-meta">
                {group.files.length} files · {formatBytes(group.bytes)}
              </div>
              {group.missing > 0 && (
                <div className="component-warning">{group.missing} missing</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ComponentTable({
  files,
  title = "Internal MCDF files",
}: {
  files: FileLike[];
  title?: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <Panel className="component-table-panel">
      <div className="panel-title-row">
        <div>
          <div className="eyebrow">Extracted package details</div>
          <h2>{title}</h2>
        </div>
        <span className="status-pill status-neutral">
          {files.length} entries
        </span>
      </div>
      <div className="component-table">
        {files.length === 0 && (
          <p className="empty-small">No internal files found.</p>
        )}
        {files.map((file) => {
          const status = fileStatus(file);
          const primaryPath = filePrimaryPath(file);
          return (
            <div key={file.index} className="file-row">
              <button
                className="file-row-main"
                onClick={() =>
                  setExpanded(expanded === file.index ? null : file.index)
                }
              >
                <span className="file-index">#{file.index + 1}</span>
                <span className="file-kind">{inferComponentKind(file)}</span>
                <span className="file-path" title={primaryPath}>
                  {primaryPath}
                </span>
                <span
                  className={`status-pill ${statusClass(status)}`}
                  title={
                    status === "not_checked"
                      ? "This file hash has not been checked against the MCDF registry yet."
                      : status === "present"
                        ? "This file hash exists in the MCDF registry."
                        : status === "missing"
                          ? "This file hash is not in the MCDF registry yet."
                          : "Registry returned this status for the file hash."
                  }
                >
                  {statusLabel(status)}
                </span>
                <span className="file-size">{formatBytes(file.length)}</span>
                <span className="file-expand">
                  {expanded === file.index ? "▾" : "▸"}
                </span>
              </button>
              {expanded === file.index && (
                <div className="file-row-details">
                  {file.game_paths.slice(1).map((path, index) => (
                    <div key={index}>also: {path}</div>
                  ))}
                  {fileOffset(file) !== undefined && (
                    <div>payload offset: {fileOffset(file)}</div>
                  )}
                  <div>MCDF file hash: {fileMcdfHash(file) || "—"}</div>
                  <div>BLAKE3 payload hash: {fileBlake3(file)}</div>
                  {"central_status" in file && (
                    <div>registry status: {statusLabel(fileStatus(file))}</div>
                  )}
                  {fileNotes(file).map((note, index) => (
                    <div key={index}>note: {note}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function AnalyzeProgressBar({
  progress,
}: {
  progress: AnalyzeProgress | null;
}) {
  if (!progress) return null;
  const safePercent = Math.max(0, Math.min(100, progress.percent));
  return (
    <div className="analyze-progress-card" role="status" aria-live="polite">
      <div className="analyze-progress-head">
        <span>{progress.title}</span>
        <strong>{safePercent}%</strong>
      </div>
      <div
        className="analyze-progress-track"
        aria-label={progress.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safePercent}
        role="progressbar"
      >
        <div
          className="analyze-progress-fill"
          style={{ width: `${safePercent}%` }}
        />
        <span>{progressLabel(progress)}</span>
      </div>
    </div>
  );
}

function PreparePanel({
  addOperation,
  updateOperation,
  finishOperation,
  autoOpenSignal = 0,
}: PanelProps & { autoOpenSignal?: number }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [info, setInfo] = useState<MCDFInfo | null>(null);
  const [files, setFiles] = useState<AnalyzedFileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<AnalyzeProgress | null>(null);
  const lastAutoOpenSignal = useRef<number>(0);

  const setStage = (
    opId: string,
    percent: number,
    title: string,
    detail: string,
    counts?: Pick<AnalyzeProgress, "known" | "missing" | "total">,
  ) => {
    const next = { percent, title, detail, ...counts };
    setProgress(next);
    updateOperation(opId, {
      stage: { percent, label: title, detail },
      message: progressLabel(next),
      bytesDone: counts?.known,
      bytesTotal: counts?.total,
    });
  };

  const chooseFile = async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: "MCDF", extensions: ["mcdf"] }],
    });
    if (!selected) return;
    const opId = addOperation({
      kind: "scan",
      label: "Analyze MCDF locally",
      stage: {
        percent: 2,
        label: "Opening file",
        detail: "Waiting for the selected bundle.",
      },
      message: "Opening selected MCDF file",
    });
    setLoading(true);
    setError(null);
    setInfo(null);
    setFiles([]);
    setSelectedPath(selected as string);
    setStage(
      opId,
      8,
      "Opening file",
      "Reading the selected MCDF bundle. Large packages can take a moment because the app opens the archive safely before it can list files.",
    );
    try {
      setStage(
        opId,
        18,
        "Opening package header",
        "This can be slow for large MCDF files. The current parser reads archive metadata and then walks internal entries to collect sizes and hashes; the faster path is a combined Rust scan that avoids opening the same package twice.",
      );
      const analyzed = await invoke<McdfAnalyzeResult>("analyze_mcdf", {
        path: selected,
      });
      const mcdf = analyzed.metadata;
      const fileInfos = analyzed.files;
      setInfo(mcdf);
      setStage(
        opId,
        34,
        "Inspecting contents",
        "Finding the internal files that need to be inspected.",
      );
      const totalBytes = fileInfos.reduce((sum, file) => sum + file.length, 0);
      setFiles(
        fileInfos.map((file) => ({
          ...file,
          online_status: "not_checked",
          central_status: "unknown",
          notes: ["Local hash calculated; registry check has not run yet."],
        })),
      );
      setStage(
        opId,
        58,
        "Hashing parts",
        `Calculated BLAKE3 payload hashes for ${fileInfos.length} internal files.`,
        { total: fileInfos.length },
      );

      const checkedFiles = applyProbeStatus(fileInfos, null);
      setFiles(checkedFiles);

      const finalMessage = `${fileInfos.length} files analyzed locally · ${fileInfos.length} BLAKE3 payload hashes ready for a later server check`;
      finishOperation(opId, {
        status: "done",
        bytesDone: totalBytes,
        bytesTotal: totalBytes,
        message: finalMessage,
        stage: {
          percent: 100,
          label: "Local analysis complete",
          detail: finalMessage,
        },
      });
      setProgress(null);
    } catch (e) {
      setInfo(null);
      setFiles([]);
      const message = String(e);
      finishOperation(opId, {
        status: "failed",
        message,
        stage: {
          percent: progress?.percent ?? 0,
          label: "Analysis failed",
          detail: message,
        },
      });
      setProgress({
        percent: progress?.percent ?? 0,
        title: "Analysis failed",
        detail: message,
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      autoOpenSignal <= 0 ||
      lastAutoOpenSignal.current === autoOpenSignal ||
      loading
    )
      return;
    lastAutoOpenSignal.current = autoOpenSignal;
    chooseFile();
  }, [autoOpenSignal]);

  const checkServerAvailability = async () => {
    if (!files.length) return;
    const token = archiveActionToken();
    if (!token) {
      setError(
        "Add an archive/admin token in Settings before checking online availability.",
      );
      return;
    }
    const localFiles = files.map(
      ({
        online_status: _onlineStatus,
        central_status: _centralStatus,
        notes: _notes,
        ...file
      }) => file,
    );
    const opId = addOperation({
      kind: "scan",
      label: "Check BLAKE3 hashes online",
      stage: {
        percent: 5,
        label: "Preparing hash manifest",
        detail: "Using the hashes from the local MCDF analysis.",
      },
      message: "Preparing hash manifest",
    });
    setLoading(true);
    setError(null);
    try {
      setStage(
        opId,
        35,
        "Sending hash manifest",
        "Sending BLAKE3 payload hashes to the archive server without uploading file bytes.",
        { known: 0, missing: 0, total: localFiles.length },
      );
      const probe = await probeKnownFiles(localFiles);
      const checkedFiles = applyProbeStatus(localFiles, probe);
      const known = probe?.known_files.length ?? 0;
      const missing = probe?.missing_files.length ?? 0;
      setFiles(checkedFiles);
      const message = `${localFiles.length} hashes checked · ${known} already online · ${missing} missing online`;
      finishOperation(opId, {
        status: "done",
        message,
        stage: {
          percent: 100,
          label: "Registry check complete",
          detail: message,
        },
      });
      setProgress(null);
    } catch (e) {
      const message = String(e);
      setError(
        `Local analysis remains available. Online availability check failed: ${message}`,
      );
      setProgress(null);
      finishOperation(opId, {
        status: "failed",
        message,
        stage: { percent: 100, label: "Server check failed", detail: message },
      });
    } finally {
      setLoading(false);
    }
  };

  const importAnalyzedMcdf = () => {
    if (!selectedPath || !info || files.length === 0) return;
    const current = readLocalMcdfLibrary();
    const existing = current.find((entry) => entry.local_path === selectedPath);
    const fileName = basename(selectedPath);
    const localFiles = files.map(
      ({
        online_status: _onlineStatus,
        central_status: _centralStatus,
        notes: _notes,
        ...file
      }) => file,
    );
    const entry: LocalMcdfEntry = {
      id: existing?.id || localEntryId(selectedPath),
      local_path: selectedPath,
      source_type: "local_file",
      source_url: null,
      source_label: "Device file",
      remote_annotation: null,
      missing_registry_percent: null,
      original_filename: fileName,
      title: existing?.title || fileName.replace(/\.mcdf$/i, ""),
      description: existing?.description || info.description || "",
      tags: existing?.tags || [],
      preview_image_path: existing?.preview_image_path || null,
      is_adult: existing?.is_adult || false,
      visibility: existing?.visibility || "public",
      package_hash_blake3: existing?.package_hash_blake3 || null,
      file_count: localFiles.length,
      total_file_bytes: localFiles.reduce((sum, file) => sum + file.length, 0),
      component_kinds: kindsFromExtractedFiles(localFiles),
      file_manifest: fileManifestFromExtractedFiles(localFiles),
      sharing_policy: existing?.sharing_policy || null,
      storage_state: existing?.storage_state || "offline",
      last_checked_at: new Date().toISOString(),
      last_published_at: existing?.last_published_at || null,
      manifest_url: existing?.manifest_url || null,
      download_url: existing?.download_url || null,
      notes: [
        "Imported from Analyze MCDF. The entry stays local until you publish it.",
        ...(info.description
          ? ["MCDF description was imported into the local entry."]
          : []),
      ],
    };
    writeLocalMcdfLibrary([
      entry,
      ...current.filter((item) => item.id !== entry.id),
    ]);
    window.dispatchEvent(
      new CustomEvent("mcdf-local-library-changed", {
        detail: { selectedId: entry.id },
      }),
    );
    setError(null);
    setProgress({
      percent: 100,
      title: "Imported to library",
      detail: `${entry.title} was added to MCDF Manager.`,
    });
    window.setTimeout(() => setProgress(null), 1800);
  };

  const componentGroups = groupedFiles(files);
  const totalBytes = files.reduce((sum, file) => sum + file.length, 0);
  const knownOnline = files.filter(
    (file) => file.online_status === "present",
  ).length;
  const missingOnline = files.filter(
    (file) => file.online_status === "missing",
  ).length;
  const notChecked = files.filter(
    (file) => file.online_status === "not_checked",
  ).length;
  const registryChecked = files.length > 0 && notChecked === 0;

  return (
    <div className="analyzer-screen analyzer-results-only">
      <div className="main-stack">
        <div className="analyzer-action-bar always-visible">
          <div className="analyzer-current-file">
            <span>MCDF</span>
            <strong title={selectedPath || "No file selected yet"}>
              {selectedPath ? basename(selectedPath) : "No file selected"}
            </strong>
          </div>
          <div className="hero-actions">
            <PrimaryButton onClick={chooseFile} disabled={loading}>
              {loading
                ? "Working…"
                : files.length > 0
                  ? "Analyze another…"
                  : "Choose MCDF…"}
            </PrimaryButton>
            <GhostButton
              onClick={importAnalyzedMcdf}
              disabled={loading || !selectedPath || !info || files.length === 0}
              title="Add this analyzed MCDF to the local library without publishing it."
            >
              Import to library
            </GhostButton>
            {files.length > 0 && (
              <GhostButton
                onClick={checkServerAvailability}
                disabled={loading || !archiveActionToken()}
                title={
                  archiveActionToken()
                    ? "Send only the BLAKE3 hash manifest to the archive server."
                    : "Add an archive/admin token in Settings before checking registry hashes."
                }
              >
                Check registry hashes
              </GhostButton>
            )}
          </div>
        </div>
        <AnalyzeProgressBar progress={progress} />
        <ErrorBox error={error} />
        {!selectedPath && !loading && !progress && (
          <div className="analyzer-empty-note">
            Choose an MCDF from the action bar. The file picker also opens
            automatically when this page is selected.
          </div>
        )}
        {info && (
          <Panel className="analysis-result-panel analysis-metadata-panel">
            <div className="panel-title-row">
              <div>
                <div className="eyebrow">Metadata</div>
                <h2>Package notes</h2>
              </div>
              <span className="status-pill status-good">loaded</span>
            </div>
            {info.description ? (
              <p className="metadata-description">{info.description}</p>
            ) : (
              <p className="empty-small">
                No written description was stored inside this MCDF.
              </p>
            )}
            <div
              className="metadata-presence-row"
              aria-label="Detected MCDF metadata sections"
            >
              {info.glamourer_data && (
                <span
                  className="status-pill status-good"
                  title="Glamourer data exists in this MCDF."
                >
                  Glamourer
                </span>
              )}
              {info.customize_plus_data && (
                <span
                  className="status-pill status-good"
                  title="Customize+ data exists in this MCDF."
                >
                  Customize+
                </span>
              )}
              {info.manipulation_data && (
                <span
                  className="status-pill status-good"
                  title="Manipulation data exists in this MCDF."
                >
                  Manipulation
                </span>
              )}
              {!info.glamourer_data &&
                !info.customize_plus_data &&
                !info.manipulation_data && (
                  <span
                    className="status-pill status-neutral"
                    title="No recognized metadata sections were found. Internal files are still listed below."
                  >
                    No recognized character metadata
                  </span>
                )}
            </div>
          </Panel>
        )}
        {files.length > 0 && (
          <Panel className="analysis-result-panel">
            <div className="panel-title-row">
              <div>
                <div className="eyebrow">Component groups</div>
                <h2>{files.length} internal files</h2>
              </div>
              <span className="status-pill status-neutral">
                {formatBytes(totalBytes)}
              </span>
            </div>
            <div className="analysis-status-strip">
              <span title="BLAKE3 payload hashes calculated from this local MCDF.">
                <strong>{files.length}</strong> local hashes
              </span>
              {registryChecked ? (
                <span title="Hashes already known by the MCDF registry.">
                  <strong>{knownOnline}</strong> known in registry
                </span>
              ) : (
                <span title="Use Check registry hashes to compare local file hashes with the MCDF registry.">
                  registry not checked
                </span>
              )}
              {registryChecked && (
                <span title="Hashes not present in the MCDF registry after the check.">
                  <strong>{missingOnline}</strong> missing in registry
                </span>
              )}
            </div>
            <div className="component-grid">
              {componentGroups.map((group) => (
                <div key={group.kind} className="component-card">
                  <strong>{group.kind}</strong>
                  <span>
                    {group.files.length} files · {formatBytes(group.bytes)}
                  </span>
                  <small
                    title={
                      registryChecked
                        ? "Registry counts for this component group."
                        : "Use Check registry hashes to compare this group with the MCDF registry."
                    }
                  >
                    {registryChecked
                      ? `${group.online} known · ${group.missing} missing`
                      : "registry not checked"}
                  </small>
                </div>
              ))}
            </div>
          </Panel>
        )}
        {files.length > 0 && (
          <ComponentTable files={files} title="Internal file inventory" />
        )}
      </div>
    </div>
  );
}

function AddMcdfEntryModal({
  open,
  onClose,
  addOperation,
  updateOperation,
  finishOperation,
}: { open: boolean; onClose: () => void } & PanelProps) {
  const [step, setStep] = useState<"choose" | "details">("choose");
  const [draft, setDraft] = useState<McdfAddDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<AnalyzeProgress | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remotePreviewUrl, setRemotePreviewUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep("choose");
    setDraft(null);
    setLoading(false);
    setError(null);
    setProgress(null);
    setRemoteUrl("");
    setRemotePreviewUrl("");
  }, [open]);

  if (!open) return null;

  const setStage = (
    opId: string,
    percent: number,
    title: string,
    detail: string,
  ) => {
    const next = { percent, title, detail };
    setProgress(next);
    updateOperation(opId, {
      stage: { percent, label: title, detail },
      message: progressLabel(next),
    });
  };

  const chooseLocalMcdf = async () => {
    const opId = addOperation({
      kind: "scan",
      label: "Add MCDF to library",
      stage: {
        percent: 2,
        label: "Opening file",
        detail: "Waiting for the selected MCDF.",
      },
      message: "Opening selected MCDF",
    });
    setLoading(true);
    setError(null);
    setProgress({
      percent: 2,
      title: "Opening file",
      detail: "Waiting for the selected MCDF.",
    });
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: "MCDF", extensions: ["mcdf"] }],
      });
      if (!selected || Array.isArray(selected)) {
        finishOperation(opId, {
          status: "done",
          message: "No MCDF selected",
          stage: {
            percent: 100,
            label: "Cancelled",
            detail: "No file was selected.",
          },
        });
        setProgress(null);
        return;
      }
      setStage(
        opId,
        18,
        "Reading MCDF",
        "Reading the character metadata from the selected file.",
      );
      const info = await invoke<MCDFInfo>("scan_mcdf", { path: selected });
      setStage(
        opId,
        42,
        "Inspecting package",
        "Collecting a lightweight inventory for labels and file counts.",
      );
      const files = await invoke<ExtractedFileInfo[]>("inspect_mcdf_files", {
        path: selected,
      });
      setStage(
        opId,
        82,
        "Preparing library entry",
        "Creating editable details before it is added locally.",
      );
      const fileName = basename(selected);
      setDraft({
        path: selected,
        fileName,
        info,
        files,
        title: fileName.replace(/\.mcdf$/i, ""),
        description: info.description || "",
        tags: "",
        previewPath: null,
        isAdult: false,
        visibility: "public",
      });
      setStep("details");
      const message = `${files.length} internal files found. Review the library details before adding.`;
      setStage(opId, 100, "Ready to add", message);
      finishOperation(opId, {
        status: "done",
        message,
        stage: { percent: 100, label: "Ready to add", detail: message },
      });
    } catch (e) {
      const message = String(e);
      setError(message);
      setProgress({
        percent: progress?.percent ?? 0,
        title: "Could not read MCDF",
        detail: message,
      });
      finishOperation(opId, {
        status: "failed",
        message,
        stage: {
          percent: progress?.percent ?? 0,
          label: "Could not read MCDF",
          detail: message,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const chooseRemoteMcdf = async () => {
    const trimmedUrl = remoteUrl.trim();
    if (!trimmedUrl) {
      setError("Paste a Google Drive or direct MCDF link first.");
      return;
    }
    const opId = addOperation({
      kind: "scan",
      label: "Add remote MCDF to library",
      stage: {
        percent: 5,
        label: "Checking link",
        detail: "Preparing to read the remote MCDF metadata.",
      },
      message: "Checking remote MCDF link",
    });
    setLoading(true);
    setError(null);
    setProgress({
      percent: 5,
      title: "Checking link",
      detail: "Preparing to read the remote MCDF metadata.",
    });
    try {
      setStage(
        opId,
        22,
        "Reading remote MCDF",
        "Downloading just enough metadata to prepare a local library entry.",
      );
      const scanned = await invoke<RemoteMcdfScanResult>(
        "scan_remote_mcdf_metadata",
        { url: trimmedUrl },
      );
      const sourceType = remoteSourceTypeFromUrl(trimmedUrl);
      setDraft({
        path: "",
        fileName:
          scanned.original_filename || scanned.title || "Remote MCDF.mcdf",
        info: {
          description: scanned.description || "",
          glamourer_data: "",
          customize_plus_data: "",
          manipulation_data: "",
          files: [],
        },
        files: [],
        title:
          scanned.title ||
          (scanned.original_filename || "Remote MCDF").replace(/\.mcdf$/i, ""),
        description: scanned.description || "",
        tags: "",
        previewPath: remotePreviewUrl.trim() || null,
        isAdult: false,
        visibility: "public",
        sourceType,
        sourceUrl: trimmedUrl,
        sourceLabel:
          sourceType === "google_drive" ? "Google Drive" : "Direct link",
        remoteAnnotation:
          "Remote entry. The MCDF is not stored locally until you download it.",
        packageHash: scanned.package_hash_blake3,
        fileCount: scanned.file_count,
        totalBytes: scanned.total_file_bytes || scanned.package_size,
        componentKinds: scanned.component_kinds,
        notes: [
          ...scanned.notes,
          "Added from a remote source. No files were uploaded.",
        ],
      });
      setStep("details");
      const message = `${scanned.file_count} files found. Review the entry before adding it.`;
      setStage(opId, 100, "Ready to add", message);
      finishOperation(opId, {
        status: "done",
        message,
        stage: { percent: 100, label: "Ready to add", detail: message },
      });
    } catch (e) {
      const message = String(e);
      setError(message);
      setProgress({
        percent: progress?.percent ?? 0,
        title: "Could not read remote MCDF",
        detail: message,
      });
      finishOperation(opId, {
        status: "failed",
        message,
        stage: {
          percent: progress?.percent ?? 0,
          label: "Could not read remote MCDF",
          detail: message,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const chooseDraftPreview = async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [
        {
          name: "Preview image",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"],
        },
      ],
    });
    if (!selected || Array.isArray(selected) || !draft) return;
    setDraft({ ...draft, previewPath: selected });
  };

  const addDraftToLibrary = () => {
    if (!draft) return;
    setLoading(true);
    try {
      const current = readLocalMcdfLibrary();
      const isRemote = Boolean(
        draft.sourceType && draft.sourceType !== "local_file",
      );
      const existing = isRemote
        ? current.find(
            (entry) =>
              (draft.packageHash &&
                entry.package_hash_blake3 === draft.packageHash) ||
              entry.source_url === draft.sourceUrl,
          )
        : current.find((entry) => entry.local_path === draft.path);
      const now = new Date().toISOString();
      const entryId =
        existing?.id ||
        (isRemote && draft.packageHash
          ? `remote-${draft.packageHash.slice(0, 24)}`
          : localEntryId(draft.path));
      const componentKinds =
        draft.componentKinds || kindsFromExtractedFiles(draft.files);
      const entry: LocalMcdfEntry = {
        id: entryId,
        local_path: isRemote ? "" : draft.path,
        source_type: draft.sourceType || "local_file",
        source_url: draft.sourceUrl || null,
        source_label: draft.sourceLabel || "Device file",
        remote_annotation: draft.remoteAnnotation || null,
        missing_registry_percent: null,
        original_filename: draft.fileName,
        title: draft.title.trim() || draft.fileName.replace(/\.mcdf$/i, ""),
        description: draft.description.trim(),
        tags: tagsFromText(draft.tags),
        preview_image_path: draft.previewPath,
        is_adult: draft.isAdult,
        visibility: draft.visibility,
        package_hash_blake3:
          draft.packageHash || existing?.package_hash_blake3 || null,
        file_count: draft.fileCount ?? draft.files.length,
        total_file_bytes:
          draft.totalBytes ??
          draft.files.reduce((sum, file) => sum + file.length, 0),
        component_kinds: componentKinds,
        file_manifest:
          draft.files.length > 0
            ? fileManifestFromExtractedFiles(draft.files)
            : existing?.file_manifest || [],
        sharing_policy: existing?.sharing_policy || null,
        storage_state: existing?.storage_state || "offline",
        last_checked_at: now,
        last_published_at: existing?.last_published_at || null,
        manifest_url: existing?.manifest_url || null,
        download_url: existing?.download_url || null,
        notes: draft.notes || [
          "Added as a local MCDF. Registration is not required and no files were uploaded.",
          "Package inspection was only used to prepare local labels, counts, and editable library details.",
          ...(draft.info.description
            ? ["MCDF description was copied into the local entry."]
            : []),
        ],
      };
      writeLocalMcdfLibrary([
        entry,
        ...current.filter((item) => item.id !== entry.id),
      ]);
      window.dispatchEvent(
        new CustomEvent("mcdf-local-library-changed", {
          detail: { selectedId: entry.id },
        }),
      );
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-card add-entry-modal refined-add-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add MCDF entry"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-title-row refined-modal-head">
          <div>
            <div className="eyebrow">Add entry</div>
            <h2>Add MCDF</h2>
          </div>
          <button
            type="button"
            className="modal-icon-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {step === "choose" ? (
          <div className="add-entry-choice-panel add-entry-source-grid">
            <div className="remote-add-card refined-source-card">
              <div className="eyebrow">Device file</div>
              <h3>Choose an MCDF from this computer</h3>
              <p className="empty-small">
                Adds a local library entry on this device. Registration is not
                required.
              </p>
              <PrimaryButton
                disabled={loading}
                title="Adds this MCDF to the local library. Registration is not required."
                onClick={chooseLocalMcdf}
              >
                {loading ? "Reading MCDF…" : "Choose MCDF…"}
              </PrimaryButton>
            </div>
            <div className="remote-add-card refined-source-card">
              <div className="eyebrow">Remote source</div>
              <h3>Add Google Drive or direct link</h3>
              <Field
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="Google Drive or direct MCDF URL"
              />
              <Field
                value={remotePreviewUrl}
                onChange={(e) => setRemotePreviewUrl(e.target.value)}
                placeholder="Preview image URL, optional"
              />
              <GhostButton
                disabled={loading || !remoteUrl.trim()}
                onClick={chooseRemoteMcdf}
              >
                {loading ? "Reading link…" : "Read link"}
              </GhostButton>
            </div>
            <div className="add-entry-progress-row">
              <AnalyzeProgressBar progress={progress} />
              <ErrorBox error={error} />
            </div>
          </div>
        ) : draft ? (
          <div className="add-entry-review-grid">
            <button
              type="button"
              className="entry-detail-preview entry-detail-preview-button add-preview-picker"
              disabled={loading}
              onClick={chooseDraftPreview}
              title="Choose a preview image"
            >
              {draft.previewPath ? (
                <img
                  src={displayImageSrc(draft.previewPath) || undefined}
                  alt={draft.title || draft.fileName}
                />
              ) : (
                <div className="preview-placeholder large">✧</div>
              )}
              <span className="preview-edit-chip">
                {draft.previewPath ? "Change picture" : "Add picture"}
              </span>
            </button>
            <div className="add-entry-review-form">
              <div className="modal-user-copy compact">
                Review the library entry. These details stay local.
              </div>
              <label>
                <span>Display name</span>
                <Field
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                  placeholder="Character or MCDF name"
                />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                  placeholder="Short description for your library"
                  rows={4}
                />
              </label>
              <label>
                <span>Tags</span>
                <Field
                  value={draft.tags}
                  onChange={(event) =>
                    setDraft({ ...draft, tags: event.target.value })
                  }
                  placeholder="Optional tags, comma separated"
                />
              </label>
              {kindsFromExtractedFiles(draft.files).length > 0 && (
                <div className="add-entry-labels">
                  <span>Detected labels</span>
                  <div className="tag-row compact-tags label-row">
                    {kindsFromExtractedFiles(draft.files)
                      .slice(0, 8)
                      .map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                  </div>
                </div>
              )}
              <div className="analysis-status-strip add-entry-summary-strip">
                <span>
                  <strong>{draft.fileCount ?? draft.files.length}</strong> files
                </span>
                <span>
                  <strong>
                    {formatBytes(
                      draft.totalBytes ??
                        draft.files.reduce((sum, file) => sum + file.length, 0),
                    )}
                  </strong>
                </span>
                <span>
                  <strong>
                    {(
                      draft.componentKinds ||
                      kindsFromExtractedFiles(draft.files)
                    )
                      .slice(0, 4)
                      .join(", ") || "MCDF"}
                  </strong>
                </span>
              </div>
              <label className="check-row simple-adult-check">
                <input
                  type="checkbox"
                  checked={draft.isAdult}
                  onChange={(event) =>
                    setDraft({ ...draft, isAdult: event.target.checked })
                  }
                />{" "}
                <span>18+</span>
              </label>
              <div className="hero-actions">
                <GhostButton
                  disabled={loading}
                  onClick={() => setStep("choose")}
                >
                  Back
                </GhostButton>
                <PrimaryButton disabled={loading} onClick={addDraftToLibrary}>
                  {loading ? "Adding…" : "Add to Library"}
                </PrimaryButton>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OnlineLibraryPanel({
  addOperation,
  finishOperation,
}: PanelProps & { sharedArchiveConnected?: boolean }) {
  const [entries, setEntries] = useState<LocalMcdfEntry[]>(() =>
    readLocalMcdfLibrary(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [publicIndex, setPublicIndex] = useState<PublicIndexLatest | null>(
    null,
  );
  const [indexUrl] = useState(
    "https://raw.githubusercontent.com/obscure-crescent/moon-sparkles/main/public/indexes/latest.json",
  );
  const [serverUrl] = useState(configuredArchiveHost());
  const [serverToken] = useState(storedAdminToken());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishDescription, setPublishDescription] = useState("");
  const [publishTags, setPublishTags] = useState("");
  const [publishPreviewPath, setPublishPreviewPath] = useState<string | null>(
    null,
  );
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryFilter, setLibraryFilter] = useState<
    | "all"
    | "local"
    | "remote"
    | "offline"
    | "server"
    | "online"
    | "subscribed"
    | "removed"
    | "failed"
    | "adult"
    | "blocked"
    | "restricted"
    | "potentially_illegal"
  >("all");
  const [librarySettings, setLibrarySettings] = useState<LocalLibrarySettings>(
    () => readLibrarySettings(),
  );
  const [publishIsAdult, setPublishIsAdult] = useState(false);
  const [publishVisibility, setPublishVisibility] =
    useState<McdfVisibility>("public");
  const [publishingRulesAccepted, setPublishingRulesAccepted] = useState(
    hasAcceptedPublishingRules(),
  );
  const [publishingRulesOpen, setPublishingRulesOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remotePreviewUrl, setRemotePreviewUrl] = useState("");
  const [creatorSubscriptions, setCreatorSubscriptions] = useState<string[]>(
    () => readCreatorSubscriptions(),
  );
  const [packageSubscriptions, setPackageSubscriptions] = useState<string[]>(
    () => readPackageSubscriptions(),
  );
  const [packageSubscriptionSnapshots, setPackageSubscriptionSnapshots] =
    useState<Record<string, PackageSubscriptionSnapshot>>(() =>
      readPackageSubscriptionSnapshots(),
    );
  useEffect(() => {
    const syncPublishingRules = () =>
      setPublishingRulesAccepted(hasAcceptedPublishingRules());
    window.addEventListener(
      "mcdf-publishing-rules-accepted",
      syncPublishingRules,
    );
    window.addEventListener("storage", syncPublishingRules);
    return () => {
      window.removeEventListener(
        "mcdf-publishing-rules-accepted",
        syncPublishingRules,
      );
      window.removeEventListener("storage", syncPublishingRules);
    };
  }, []);

  const storedEntryHashes = new Set(
    entries
      .map((entry) => entry.package_hash_blake3)
      .filter(Boolean) as string[],
  );
  const publicPackagesByHash = new Map<string, PublicIndexPackageSummary>(
    (publicIndex?.packages || []).map((pkg) => [pkg.package_hash_blake3, pkg]),
  );
  const activeSubscribedPackages = (publicIndex?.packages || [])
    .filter(
      (pkg) =>
        (packageSubscriptions.includes(pkg.package_hash_blake3) ||
          creatorSubscriptions.includes(creatorKeyFromPackage(pkg))) &&
        !storedEntryHashes.has(pkg.package_hash_blake3),
    )
    .map((pkg) => ({
      pkg,
      removed: false,
      snapshot: packageSubscriptionSnapshots[pkg.package_hash_blake3],
    }));
  const removedSubscribedPackages = packageSubscriptions
    .filter(
      (hash) =>
        !storedEntryHashes.has(hash) &&
        !publicPackagesByHash.has(hash) &&
        packageSubscriptionSnapshots[hash],
    )
    .map((hash) => ({
      pkg: packageSubscriptionSnapshots[hash],
      removed: true,
      snapshot: packageSubscriptionSnapshots[hash],
    }));
  const subscribedIndexEntries: LocalMcdfEntry[] = [
    ...activeSubscribedPackages,
    ...removedSubscribedPackages,
  ].map(({ pkg, removed }) => {
    const summary = pkg as PublicIndexPackageSummary;
    return {
      id: `${removed ? "removed" : "subscribed"}-${pkg.package_hash_blake3.slice(0, 24)}`,
      local_path: "",
      source_type: "indexed" as LocalMcdfSourceType,
      source_url: removed ? null : pkg.download_manifest_path || null,
      source_label: removed
        ? "Removed Exchange item"
        : packageSubscriptions.includes(pkg.package_hash_blake3)
          ? "Subscribed MCDF"
          : "Subscribed creator",
      remote_annotation: removed
        ? "This online MCDF was removed from The Eorzea Exchange after you subscribed to it. It remains here as a local subscription record so you can see what changed."
        : packageSubscriptions.includes(pkg.package_hash_blake3)
          ? "This online MCDF was added to My Library locally. It has not been downloaded to this machine yet."
          : "This item is from a subscribed creator in The Eorzea Exchange. It is listed in My Library so you can track it, but it has not been downloaded to this machine yet.",
      missing_registry_percent: null,
      original_filename: pkg.original_filename,
      title: pkg.title || pkg.original_filename,
      description: pkg.description || "",
      tags: pkg.tags || [],
      preview_image_path: pkg.preview_image_path || null,
      is_adult: Boolean(pkg.is_adult),
      visibility: (pkg.visibility as McdfVisibility) || "public",
      package_hash_blake3: pkg.package_hash_blake3,
      file_count: pkg.file_count,
      total_file_bytes: pkg.total_file_bytes,
      component_kinds: summary.component_kinds || [],
      file_manifest: [],
      sharing_policy: null,
      storage_state: (removed
        ? "removed"
        : "subscribed") as LocalMcdfStorageState,
      last_checked_at: pkg.updated_at,
      last_published_at: pkg.updated_at,
      manifest_url: removed ? null : pkg.package_manifest_path,
      download_url: removed ? null : pkg.download_manifest_path,
      notes: [
        removed
          ? "This subscribed Exchange item has been removed and can no longer be downloaded from the public index."
          : packageSubscriptions.includes(pkg.package_hash_blake3)
            ? "Subscribed Exchange item. Not downloaded yet."
            : "Subscribed creator item. Not downloaded yet.",
      ],
    };
  });
  const combinedEntries = [...subscribedIndexEntries, ...entries];
  const selectedEntry =
    combinedEntries.find((entry) => entry.id === selectedId) ?? null;
  const entryHasLocalFile = (
    entry: LocalMcdfEntry | null | undefined,
  ): boolean =>
    Boolean(
      entry &&
      (entry.source_type === "local_file" || !entry.source_type) &&
      entry.local_path &&
      entry.storage_state !== "subscribed" &&
      entry.storage_state !== "removed",
    );
  const entryListedPublicly = (
    entry: LocalMcdfEntry | null | undefined,
  ): boolean =>
    Boolean(
      entry?.package_hash_blake3 &&
      publicPackagesByHash.has(entry.package_hash_blake3) &&
      entry.storage_state === "online" &&
      (entry.visibility || "public") === "public",
    );
  const entryHasPublicExchangeRecord = (
    entry: LocalMcdfEntry | null | undefined,
  ): boolean =>
    Boolean(
      entry?.package_hash_blake3 &&
      publicPackagesByHash.has(entry.package_hash_blake3) &&
      entry.storage_state !== "removed" &&
      (entry.visibility || "public") === "public",
    );
  const publicIndexAssetUrl = (path?: string | null): string | null => {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const base = indexUrl.replace(/\/indexes\/latest\.json(?:\?.*)?$/i, "");
    return `${base}/${path.replace(/^\/+/, "")}`;
  };
  const publicExchangeShareText = (entry: LocalMcdfEntry): string => {
    const pkg = entry.package_hash_blake3
      ? publicPackagesByHash.get(entry.package_hash_blake3)
      : null;
    const manifestUrl = publicIndexAssetUrl(
      pkg?.download_manifest_path ||
        entry.download_url ||
        pkg?.package_manifest_path ||
        entry.manifest_url,
    );
    const title =
      entry.title && !entry.title.includes("\\")
        ? entry.title
        : basename(entry.original_filename || entry.local_path || "MCDF entry");
    return [
      `${title} on The Eorzea Exchange`,
      `Package hash: ${entry.package_hash_blake3 || "unknown"}`,
      manifestUrl
        ? `Download manifest: ${manifestUrl}`
        : `Public index: ${indexUrl}`,
      "Open this with MCDF Manager to add it to your Library.",
    ].join("\n");
  };
  const entryPublicLabel = (entry: LocalMcdfEntry): string =>
    entryListedPublicly(entry)
      ? "public"
      : entry.storage_state === "removed"
        ? "removed"
        : entry.storage_state === "subscribed"
          ? "not downloaded"
          : "not listed";
  const entryPublicClass = (entry: LocalMcdfEntry): string =>
    entryListedPublicly(entry)
      ? "status-good"
      : entry.storage_state === "removed"
        ? "status-bad"
        : entry.storage_state === "server" || entry.storage_state === "online"
          ? "status-warn"
          : "status-neutral";
  const entryStatusLabel = (entry: LocalMcdfEntry): string =>
    entryHasLocalFile(entry)
      ? "on device"
      : entry.storage_state === "online" && !entryListedPublicly(entry)
        ? "not listed"
        : stateLabel(entry.storage_state);
  const entryStatusClass = (entry: LocalMcdfEntry): string =>
    entryHasLocalFile(entry)
      ? "status-neutral"
      : entry.storage_state === "online" && !entryListedPublicly(entry)
        ? "status-warn"
        : stateClass(entry.storage_state);
  const detailStatusPills = (
    entry: LocalMcdfEntry,
  ): Array<{ label: string; className: string }> => {
    const candidates = [
      ...(entryHasLocalFile(entry)
        ? []
        : [
            {
              label: entryStatusLabel(entry),
              className: entryStatusClass(entry),
            },
          ]),
      ...(entryListedPublicly(entry) ||
      entry.storage_state === "removed" ||
      entry.storage_state === "subscribed"
        ? [
            {
              label: entryPublicLabel(entry),
              className: entryPublicClass(entry),
            },
          ]
        : []),
      ...(entry.source_type && entry.source_type !== "local_file"
        ? [{ label: sourceLabel(entry), className: sourceClass(entry) }]
        : []),
      ...(entry.sharing_policy?.status === "blocked"
        ? [
            {
              label: `${sharingPolicyLabel(entry)}: ${entry.sharing_policy.label}`,
              className: sharingPolicyClass(entry.sharing_policy),
            },
          ]
        : []),
      { label: `${entry.file_count} files`, className: "status-neutral" },
      {
        label: formatBytes(entry.total_file_bytes),
        className: "status-neutral",
      },
      ...(entryIsAdult(entry)
        ? [{ label: "18+", className: "status-warn" }]
        : []),
    ];
    const seen = new Set<string>();
    return candidates.filter((pill) => {
      const key = pill.label.toLowerCase();
      if (!pill.label || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const [addEntryModalOpen, setAddEntryModalOpen] = useState(false);
  const [editEntryDetails, setEditEntryDetails] = useState(false);
  const [detailsPaneOpen, setDetailsPaneOpen] = useState(true);
  useEffect(() => {
    const openAddEntry = () => setAddEntryModalOpen(true);
    const refreshSettings = () => setLibrarySettings(readLibrarySettings());
    const refreshLocalEntries = (event?: Event) => {
      setEntries(readLocalMcdfLibrary());
      const selected = (
        event as CustomEvent<{ selectedId?: string }> | undefined
      )?.detail?.selectedId;
      if (selected) {
        setSelectedId(selected);
        setDetailsPaneOpen(true);
      }
    };
    window.addEventListener("mcdf-open-add-entry", openAddEntry);
    window.addEventListener("mcdf-local-library-changed", refreshLocalEntries);
    const refreshSubscriptions = () => {
      setCreatorSubscriptions(readCreatorSubscriptions());
      setPackageSubscriptions(readPackageSubscriptions());
      setPackageSubscriptionSnapshots(readPackageSubscriptionSnapshots());
    };
    window.addEventListener("mcdf-library-settings-changed", refreshSettings);
    window.addEventListener(
      "mcdf-creator-subscriptions-changed",
      refreshSubscriptions,
    );
    return () => {
      window.removeEventListener("mcdf-open-add-entry", openAddEntry);
      window.removeEventListener(
        "mcdf-local-library-changed",
        refreshLocalEntries,
      );
      window.removeEventListener(
        "mcdf-library-settings-changed",
        refreshSettings,
      );
      window.removeEventListener(
        "mcdf-creator-subscriptions-changed",
        refreshSubscriptions,
      );
    };
  }, []);
  const filteredEntries = combinedEntries.filter((entry) => {
    const haystack =
      `${entry.title} ${entry.original_filename} ${entry.description} ${entry.tags.join(" ")} ${entry.component_kinds.join(" ")} ${entry.source_url || ""}`.toLowerCase();
    const matchesSearch =
      !librarySearch.trim() ||
      haystack.includes(librarySearch.trim().toLowerCase());
    const adult = entryIsAdult(entry);
    const adultVisible =
      librarySettings.adultContentMode === "show" ||
      !adult ||
      libraryFilter === "adult";
    const matchesFilter =
      libraryFilter === "all" ||
      (libraryFilter === "local" && !isRemoteEntry(entry)) ||
      (libraryFilter === "remote" && isRemoteEntry(entry)) ||
      (libraryFilter === "adult" && adult) ||
      (libraryFilter === "blocked" &&
        entry.sharing_policy?.status === "blocked") ||
      (libraryFilter === "restricted" &&
        entry.sharing_policy?.classification === "restricted") ||
      (libraryFilter === "potentially_illegal" &&
        entry.sharing_policy?.classification === "potentially_illegal") ||
      entry.storage_state === libraryFilter;
    return matchesSearch && matchesFilter && adultVisible;
  });

  const closeDetailsWhenClickingOutside = (
    event: MouseEvent<HTMLDivElement>,
  ) => {
    if (!detailsPaneOpen) return;
    const target = event.target as HTMLElement;
    if (
      target.closest(".elevated-detail-pane") ||
      target.closest(".library-table-row") ||
      target.closest(".library-card") ||
      target.closest(".modal-card")
    )
      return;
    setDetailsPaneOpen(false);
  };

  const saveEntries = (next: LocalMcdfEntry[]) => {
    setEntries(next);
    writeLocalMcdfLibrary(next);
    if (
      selectedId &&
      !selectedId.startsWith("subscribed-") &&
      !next.some((entry) => entry.id === selectedId)
    )
      setSelectedId(null);
  };

  const saveLibrarySettings = (patch: Partial<LocalLibrarySettings>) => {
    const next = { ...librarySettings, ...patch };
    setLibrarySettings(next);
    writeLibrarySettings(next);
  };

  const updateEntry = (id: string, patch: Partial<LocalMcdfEntry>) => {
    saveEntries(
      entries.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const choosePreview = async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [
        {
          name: "Preview image",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"],
        },
      ],
    });
    if (!selected || Array.isArray(selected)) return;
    setPublishPreviewPath(selected);
    if (
      selectedEntry &&
      !selectedEntry.id.startsWith("subscribed-") &&
      !selectedEntry.id.startsWith("removed-")
    )
      updateEntry(selectedEntry.id, { preview_image_path: selected });
  };

  const clearPreview = () => {
    setPublishPreviewPath(null);
    if (
      selectedEntry &&
      !selectedEntry.id.startsWith("subscribed-") &&
      !selectedEntry.id.startsWith("removed-")
    )
      updateEntry(selectedEntry.id, { preview_image_path: null });
  };

  const addMcdfToLibrary = async () => {
    setLoading(true);
    setError(null);
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: "MCDF", extensions: ["mcdf"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      const [info, files] = await Promise.all([
        invoke<MCDFInfo>("scan_mcdf", { path: selected }),
        invoke<ExtractedFileInfo[]>("inspect_mcdf_files", { path: selected }),
      ]);
      const fileName = basename(selected);
      const existing = entries.find((entry) => entry.local_path === selected);
      const entry: LocalMcdfEntry = {
        id: existing?.id || localEntryId(selected),
        local_path: selected,
        source_type: "local_file",
        source_url: null,
        source_label: "Device file",
        remote_annotation: null,
        missing_registry_percent: null,
        original_filename: fileName,
        title: existing?.title || fileName.replace(/\.mcdf$/i, ""),
        description: existing?.description || info.description || "",
        tags: existing?.tags || [],
        preview_image_path: existing?.preview_image_path || null,
        is_adult: existing?.is_adult || false,
        visibility: existing?.visibility || "public",
        package_hash_blake3: existing?.package_hash_blake3 || null,
        file_count: files.length,
        total_file_bytes: files.reduce((sum, file) => sum + file.length, 0),
        component_kinds: kindsFromExtractedFiles(files),
        file_manifest: fileManifestFromExtractedFiles(files),
        sharing_policy: existing?.sharing_policy || null,
        storage_state: existing?.storage_state || "offline",
        last_checked_at: new Date().toISOString(),
        last_published_at: existing?.last_published_at || null,
        manifest_url: existing?.manifest_url || null,
        download_url: existing?.download_url || null,
        notes: [
          "Added to the local library. It is available for local use and publishing from My Library.",
          ...(info.description
            ? ["MCDF description was imported into the local entry."]
            : []),
        ],
      };
      const next = [entry, ...entries.filter((item) => item.id !== entry.id)];
      saveEntries(next);
      setSelectedId(entry.id);
      setPublishTitle(entry.title);
      setPublishDescription(entry.description);
      setPublishTags(entry.tags.join(", "));
      setPublishPreviewPath(entry.preview_image_path || null);
      setAddEntryModalOpen(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const addRemoteEntry = async () => {
    const trimmedUrl = remoteUrl.trim();
    if (!trimmedUrl) {
      setError("Paste a Google Drive or direct MCDF URL first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const scanned = await invoke<RemoteMcdfScanResult>(
        "scan_remote_mcdf_metadata",
        { url: trimmedUrl },
      );
      const sourceType = remoteSourceTypeFromUrl(trimmedUrl);
      const entry: LocalMcdfEntry = {
        id: `remote-${scanned.package_hash_blake3.slice(0, 24)}`,
        local_path: "",
        source_type: sourceType,
        source_url: trimmedUrl,
        source_label:
          sourceType === "google_drive" ? "Google Drive" : "Direct URL",
        remote_annotation:
          "Remote entry scanned through a temporary download. The MCDF was removed from temp storage after metadata extraction.",
        missing_registry_percent: null,
        original_filename: scanned.original_filename,
        title: publishTitle.trim() || scanned.title,
        description: publishDescription.trim() || scanned.description || "",
        tags: tagsFromText(publishTags),
        preview_image_path: remotePreviewUrl.trim() || null,
        is_adult: publishIsAdult,
        package_hash_blake3: scanned.package_hash_blake3,
        file_count: scanned.file_count,
        total_file_bytes: scanned.total_file_bytes || scanned.package_size,
        component_kinds: scanned.component_kinds,
        file_manifest: [],
        sharing_policy: null,
        storage_state: "offline",
        last_checked_at: new Date().toISOString(),
        last_published_at: null,
        manifest_url: null,
        download_url: null,
        notes: [
          ...scanned.notes,
          "Remote source has been added as an annotated library entry. Publishing can index it later without keeping the temporary MCDF locally.",
          "Registry availability is checked during publishing and server-side processing.",
        ],
      };
      const next = [entry, ...entries.filter((item) => item.id !== entry.id)];
      saveEntries(next);
      setSelectedId(entry.id);
      setPublishTitle(entry.title);
      setPublishDescription(entry.description);
      setPublishTags(entry.tags.join(", "));
      setPublishPreviewPath(entry.preview_image_path || null);
      setRemoteUrl("");
      setRemotePreviewUrl("");
      setAddEntryModalOpen(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const downloadSubscribedEntry = async (entry = selectedEntry) => {
    if (!entry || entry.storage_state !== "subscribed") return;
    const manifestPath = entry.download_url || entry.manifest_url || "";
    if (!manifestPath) {
      setError(
        "This subscribed item does not include a downloadable public manifest yet.",
      );
      return;
    }
    const selected = await save({
      defaultPath: `${entry.original_filename.replace(/\.mcdf$/i, "")}.rebuilt.mcdf`,
      filters: [{ name: "MCDF", extensions: ["mcdf"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ArchiveDownloadResult>(
        "download_package_from_exchange_index",
        {
          indexUrl,
          packageManifestPath: manifestPath,
          serverUrl: configuredArchiveHost(),
          outputPath: selected,
        },
      );
      const downloadedEntry: LocalMcdfEntry = {
        ...entry,
        id: localEntryId(result.output_path),
        local_path: result.output_path,
        source_type: "local_file",
        source_label: "Downloaded from Exchange",
        remote_annotation: "Downloaded from a public Exchange entry.",
        storage_state: "online",
        last_checked_at: new Date().toISOString(),
        notes: [
          "Downloaded from The Eorzea Exchange into the local library.",
          ...(entry.notes || []),
        ],
      };
      const nextPackageSubscriptions = packageSubscriptions.filter(
        (hash) => hash !== entry.package_hash_blake3,
      );
      setPackageSubscriptions(nextPackageSubscriptions);
      writePackageSubscriptions(nextPackageSubscriptions);
      if (entry.package_hash_blake3)
        removePackageSubscriptionSnapshot(entry.package_hash_blake3);
      saveEntries([
        downloadedEntry,
        ...entries.filter((entry) => entry.id !== downloadedEntry.id),
      ]);
      setSelectedId(downloadedEntry.id);
      window.dispatchEvent(new Event("mcdf-creator-subscriptions-changed"));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const shareEntry = async (entry: LocalMcdfEntry) => {
    if (!entryHasPublicExchangeRecord(entry)) {
      setError("Only public Exchange entries can be shared from this action.");
      return;
    }
    setError(null);
    const text = publicExchangeShareText(entry);
    try {
      await navigator.clipboard.writeText(text);
      setActionMessage("Share reference copied to clipboard.");
    } catch {
      setActionMessage(text);
    }
  };

  const exportLocalEntry = async (entry: LocalMcdfEntry) => {
    if (entry.storage_state === "subscribed") {
      await downloadSubscribedEntry(entry);
      return;
    }
    if (!entryHasLocalFile(entry)) {
      setError(
        "This library entry does not have a local MCDF file to export yet.",
      );
      return;
    }
    const defaultName =
      (
        entry.original_filename || basename(entry.local_path || "export.mcdf")
      ).replace(/\.mcdf$/i, "") + ".mcdf";
    const selected = await save({
      defaultPath: defaultName,
      filters: [{ name: "MCDF", extensions: ["mcdf"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    const opId = addOperation({
      kind: "download",
      label: `Export ${entry.title || entry.original_filename}`,
      stage: {
        percent: 30,
        label: "Exporting local MCDF",
        detail: "Copying the selected library file to the chosen destination.",
      },
    });
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ExportLocalMcdfResult>(
        "export_local_mcdf_file",
        { sourcePath: entry.local_path, outputPath: selected },
      );
      finishOperation(opId, {
        status: "done",
        bytesDone: result.bytes_written,
        bytesTotal: result.bytes_written,
        message: `Exported to ${result.output_path}`,
        stage: {
          percent: 100,
          label: "Export complete",
          detail: formatBytes(result.bytes_written),
        },
      });
      setActionMessage(`Exported MCDF to ${result.output_path}`);
    } catch (e) {
      const message = String(e);
      finishOperation(opId, {
        status: "failed",
        message,
        stage: { percent: 100, label: "Export failed", detail: message },
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const publishEntry = (entry: LocalMcdfEntry) => {
    selectEntry(entry);
    void publishSelected(entry);
  };

  const removeEntry = (entry: LocalMcdfEntry) => {
    removeSelected(entry);
  };

  const entryCanPublish = (entry: LocalMcdfEntry): boolean =>
    Boolean(
      entry.storage_state !== "subscribed" &&
      entry.storage_state !== "removed" &&
      hasStoredClientAuth() &&
      !isRemoteEntry(entry) &&
      publishingRulesAccepted &&
      entry.sharing_policy?.status !== "blocked",
    );
  const LibraryEntryActions = ({
    entry,
    compact = false,
  }: {
    entry: LocalMcdfEntry;
    compact?: boolean;
  }) => (
    <div
      className={`library-action-cluster ${compact ? "compact" : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <IconButton
        label={
          entryHasPublicExchangeRecord(entry)
            ? "Copy public Exchange share reference"
            : "Share unavailable until this entry is public"
        }
        disabled={loading || !entryHasPublicExchangeRecord(entry)}
        className="library-action-button"
        onClick={() => void shareEntry(entry)}
      >
        ↗
      </IconButton>
      <IconButton
        label={
          entry.storage_state === "subscribed"
            ? "Download MCDF from Exchange"
            : "Export MCDF from library"
        }
        disabled={
          loading ||
          (!entryHasLocalFile(entry) && entry.storage_state !== "subscribed")
        }
        className="library-action-button"
        onClick={() => void exportLocalEntry(entry)}
      >
        ⇩
      </IconButton>
      <IconButton
        label={
          entry.sharing_policy?.status === "blocked"
            ? "Publishing blocked by sharing policy"
            : "Publish to The Eorzea Exchange"
        }
        disabled={loading || !entryCanPublish(entry)}
        className="library-action-button"
        onClick={() => publishEntry(entry)}
      >
        ✦
      </IconButton>
      <IconButton
        label={
          entry.storage_state === "subscribed" ||
          entry.storage_state === "removed"
            ? "Remove subscription"
            : "Remove from library"
        }
        disabled={loading}
        className="library-action-button danger"
        onClick={() => removeEntry(entry)}
      >
        ×
      </IconButton>
    </div>
  );

  const removeSelected = (entry = selectedEntry) => {
    if (!entry) return;
    if (
      entry.storage_state === "subscribed" ||
      entry.storage_state === "removed"
    ) {
      const selectedPackageHash = entry.package_hash_blake3 || "";
      if (
        selectedPackageHash &&
        packageSubscriptions.includes(selectedPackageHash)
      ) {
        const nextPackageSubscriptions = packageSubscriptions.filter(
          (id) => id !== selectedPackageHash,
        );
        setPackageSubscriptions(nextPackageSubscriptions);
        writePackageSubscriptions(nextPackageSubscriptions);
        removePackageSubscriptionSnapshot(selectedPackageHash);
      } else {
        const matchedPackage = publicIndex?.packages.find(
          (pkg) => pkg.package_hash_blake3 === selectedPackageHash,
        );
        const creatorId = matchedPackage
          ? creatorKeyFromPackage(matchedPackage)
          : null;
        if (creatorId) {
          const nextSubscriptions = creatorSubscriptions.filter(
            (id) => id !== creatorId,
          );
          setCreatorSubscriptions(nextSubscriptions);
          writeCreatorSubscriptions(nextSubscriptions);
        }
      }
      window.dispatchEvent(new Event("mcdf-creator-subscriptions-changed"));
      setSelectedId(null);
      return;
    }
    const next = entries.filter((item) => item.id !== entry.id);
    saveEntries(next);
    setSelectedId(next[0]?.id ?? null);
  };

  const loadIndexState = async () => {
    setLoading(true);
    setError(null);
    try {
      const latest = await invoke<PublicIndexLatest>(
        "fetch_public_marketplace_index",
        { indexUrl },
      );
      setPublicIndex(latest);
      const online = new Set(
        latest.packages.map((pkg) => pkg.package_hash_blake3),
      );
      const next = entries.map((entry) => {
        if (
          entry.package_hash_blake3 &&
          online.has(entry.package_hash_blake3)
        ) {
          return {
            ...entry,
            storage_state: "online" as LocalMcdfStorageState,
            last_checked_at: new Date().toISOString(),
          };
        }
        if (entry.storage_state === "online") {
          return {
            ...entry,
            storage_state: "removed" as LocalMcdfStorageState,
            last_checked_at: new Date().toISOString(),
            notes: [
              "This MCDF is no longer listed in The Eorzea Exchange. It was previously online but has been removed from the public index.",
              ...(entry.notes || []),
            ],
          };
        }
        return { ...entry, last_checked_at: new Date().toISOString() };
      });
      saveEntries(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const checkLibrarySharingPolicy = async () => {
    const token = storedAdminToken().trim() || archiveActionToken();
    if (!token) {
      setError(
        "A moderation/admin token is required to check local entries against the restricted and potentially illegal hash list.",
      );
      return;
    }
    const opId = addOperation({
      kind: "scan",
      label: "Check library sharing policy",
      stage: {
        percent: 10,
        label: "Loading moderation hashes",
        detail:
          "Checking package and file BLAKE3 hashes against the moderation blocklist.",
      },
      message: "Checking moderation hash list",
    });
    setLoading(true);
    setError(null);
    try {
      const blocks = await invoke<ModerationBlocklistResponse>(
        "fetch_moderation_blocklist",
        { serverUrl, bearerToken: token },
      );
      const checkedAt = new Date().toISOString();
      const next = entries.map((entry) => ({
        ...entry,
        sharing_policy: sharingPolicyForEntry(entry, blocks, checkedAt),
        last_checked_at: checkedAt,
      }));
      saveEntries(next);
      const blocked = next.filter(
        (entry) => entry.sharing_policy?.status === "blocked",
      ).length;
      finishOperation(opId, {
        status: "done",
        message: `${next.length} entries checked · ${blocked} blocked from sharing`,
        stage: {
          percent: 100,
          label: "Sharing policy checked",
          detail: `${blocked} local entries contain a blocked package or file hash.`,
        },
      });
    } catch (e) {
      const message = String(e);
      finishOperation(opId, {
        status: "failed",
        message,
        stage: { percent: 100, label: "Policy check failed", detail: message },
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const refreshEntrySharingPolicy = async (entry: LocalMcdfEntry): Promise<LocalSharingPolicy | null> => {
    const token = storedAdminToken().trim() || archiveActionToken();
    if (!token) return null;
    const blocks = await invoke<ModerationBlocklistResponse>(
      "fetch_moderation_blocklist",
      { serverUrl, bearerToken: token },
    );
    const checkedAt = new Date().toISOString();
    const policy = sharingPolicyForEntry(entry, blocks, checkedAt);
    updateEntry(entry.id, { sharing_policy: policy, last_checked_at: checkedAt });
    return policy;
  };

  const refreshSelectedSharingPolicy = async () => {
    if (!selectedEntry) return;
    const token = storedAdminToken().trim() || archiveActionToken();
    if (!token) {
      setError(
        "Admin or moderation access is required to refresh local sharing policy before publishing. The registry still enforces blocked hashes during upload.",
      );
      return;
    }
    const opId = addOperation({
      kind: "scan",
      label: "Refresh moderation status",
      stage: {
        percent: 20,
        label: "Checking moderation hashes",
        detail: "Checking this entry's package and file BLAKE3 hashes.",
      },
      message: "Checking moderation status",
    });
    setLoading(true);
    setError(null);
    try {
      const policy = await refreshEntrySharingPolicy(selectedEntry);
      finishOperation(opId, {
        status: "done",
        message:
          policy?.status === "blocked"
            ? `${policy.label}: sharing blocked`
            : "No moderation block matched this entry",
        stage: {
          percent: 100,
          label: "Moderation status refreshed",
          detail:
            policy?.status === "blocked"
              ? policy.summary
              : "This entry has no local moderation block match.",
        },
      });
    } catch (e) {
      const message = String(e);
      finishOperation(opId, {
        status: "failed",
        message,
        stage: { percent: 100, label: "Moderation check failed", detail: message },
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIndexState();
  }, []);

  const selectEntry = (entry: LocalMcdfEntry) => {
    setSelectedId(entry.id);
    setDetailsPaneOpen(true);
    setPublishTitle(entry.title);
    setPublishDescription(entry.description);
    setPublishTags(entry.tags.join(", "));
    setPublishPreviewPath(entry.preview_image_path || null);
    setPublishIsAdult(Boolean(entryIsAdult(entry)));
    setPublishVisibility(entry.visibility || "public");
  };

  const saveMetadata = () => {
    if (!selectedEntry) return;
    updateEntry(selectedEntry.id, {
      title: publishTitle.trim() || selectedEntry.title,
      description: publishDescription.trim(),
      tags: tagsFromText(publishTags),
      preview_image_path: publishPreviewPath,
      is_adult: publishIsAdult,
      visibility: publishVisibility,
      notes: ["Local metadata updated."],
    });
  };

  const publishSelected = async (entry = selectedEntry) => {
    if (!entry) return;
    if (isRemoteEntry(entry)) {
      setError(
        "This entry is remote/index-only. Add the source to My Library, then publish from a local MCDF file or a supported remote source.",
      );
      return;
    }
    if (!hasStoredClientAuth()) {
      setError(
        "Publishing requires a registered profile. This MCDF remains available in your local library.",
      );
      return;
    }
    if (!publishingRulesAccepted) {
      setPublishingRulesOpen(true);
      setError(
        "Accept the current publishing rules before publishing. Only upload MCDFs and previews you are allowed to share.",
      );
      return;
    }
    if (entry.sharing_policy?.status === "blocked") {
      setError(
        `${entry.sharing_policy.label}: this MCDF is disallowed from sharing and cannot be uploaded. Reason: ${sharingReasonFile(entry)}`,
      );
      return;
    }
    const moderationToken = storedAdminToken().trim() || archiveActionToken();
    if (moderationToken) {
      try {
        const policy = await refreshEntrySharingPolicy(entry);
        if (policy?.status === "blocked") {
          const reason = sharingReasonFile({ sharing_policy: policy });
          setError(
            `${policy.label}: this MCDF is disallowed from sharing and cannot be uploaded. Reason: ${reason}`,
          );
          return;
        }
      } catch (policyError) {
        console.warn("sharing policy preflight failed", policyError);
      }
    }
    const usesOpenEditor = selectedEntry?.id === entry.id;
    const nextTitle = usesOpenEditor
      ? publishTitle.trim() || entry.title
      : entry.title;
    const nextDescription = usesOpenEditor
      ? publishDescription.trim()
      : entry.description;
    const nextTags = usesOpenEditor ? tagsFromText(publishTags) : entry.tags;
    const nextPreviewPath = usesOpenEditor
      ? publishPreviewPath || entry.preview_image_path || null
      : entry.preview_image_path || null;
    const nextIsAdult = usesOpenEditor
      ? publishIsAdult
      : Boolean(entryIsAdult(entry));
    const nextVisibility = usesOpenEditor
      ? publishVisibility
      : entry.visibility || "public";
    const opId = addOperation({
      kind: "upload",
      label: `Publish ${nextTitle || entry.original_filename}`,
    });
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<CentralUploadResponse>(
        "upload_mcdf_to_central_server",
        {
          path: entry.local_path,
          serverUrl,
          bearerToken: serverToken.trim() || null,
          title: nextTitle || null,
          description: nextDescription || null,
          tags: nextTags,
          previewImagePath: nextPreviewPath,
          isAdult: nextIsAdult,
          visibility: nextVisibility,
          ...localPublisherAuthHeaders(),
        },
      );
      const indexFailed = result.notes.some((note) =>
        /index sync failed/i.test(note),
      );
      updateEntry(entry.id, {
        title: nextTitle || entry.title,
        description: nextDescription || entry.description,
        tags: nextTags,
        preview_image_path: nextPreviewPath,
        is_adult: nextIsAdult,
        visibility: nextVisibility,
        package_hash_blake3: result.package_hash_blake3,
        file_count: result.file_count,
        total_file_bytes: result.package_size,
        storage_state:
          indexFailed || nextVisibility !== "public" ? "server" : "online",
        last_published_at: new Date().toISOString(),
        manifest_url: result.manifest_url,
        download_url: result.download_url,
        notes:
          result.notes.length > 0 ? result.notes : ["Published successfully."],
      });
      finishOperation(opId, {
        status: "done",
        bytesDone: result.package_size,
        message: indexFailed
          ? "server registered; index sync pending"
          : "published online",
      });
    } catch (e) {
      updateEntry(entry.id, { storage_state: "failed", notes: [String(e)] });
      finishOperation(opId, { status: "failed", message: String(e) });
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEntry) {
      setPublishTitle(selectedEntry.title);
      setPublishDescription(selectedEntry.description);
      setPublishTags(selectedEntry.tags.join(", "));
      setPublishPreviewPath(selectedEntry.preview_image_path || null);
      setPublishIsAdult(Boolean(entryIsAdult(selectedEntry)));
      setPublishVisibility(selectedEntry.visibility || "public");
    }
    setEditEntryDetails(false);
  }, [selectedEntry?.id]);

  return (
    <div
      className="screen-grid library-screen library-screen-no-preview library-flat"
      onMouseDown={closeDetailsWhenClickingOutside}
    >
      {publishingRulesOpen && (
        <PublishingRulesModal
          onClose={() => setPublishingRulesOpen(false)}
          onAccept={() => {
            acceptPublishingRules();
            setPublishingRulesAccepted(true);
            setPublishingRulesOpen(false);
          }}
        />
      )}
      {addEntryModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card add-entry-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add MCDF entry"
          >
            <div className="panel-title-row">
              <div>
                <div className="eyebrow">Add entry</div>
                <h2>Add to My Library</h2>
              </div>
              <GhostButton onClick={() => setAddEntryModalOpen(false)}>
                Close
              </GhostButton>
            </div>
            <p>
              Add a local MCDF, or scan a remote source. Remote scans use a
              temporary download only so metadata can be read and then
              discarded.
            </p>
            <div className="add-entry-grid">
              <div className="remote-add-card">
                <div className="eyebrow">Device file</div>
                <h3>Choose an MCDF from this computer</h3>
                <p className="empty-small">
                  The entry stays in your library for local use, editing,
                  publishing, and updates.
                </p>
                <PrimaryButton disabled={loading} onClick={addMcdfToLibrary}>
                  {loading ? "Working…" : "Choose MCDF…"}
                </PrimaryButton>
              </div>
              <div className="remote-add-card">
                <div className="eyebrow">Remote source</div>
                <Field
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  placeholder="Google Drive or direct MCDF URL"
                />
                <Field
                  value={remotePreviewUrl}
                  onChange={(e) => setRemotePreviewUrl(e.target.value)}
                  placeholder="Preview image URL, optional"
                />
                <GhostButton
                  disabled={loading || !remoteUrl.trim()}
                  onClick={addRemoteEntry}
                >
                  Scan temp + add remote entry
                </GhostButton>
                <p className="empty-small">
                  Remote entries are annotated separately and do not need to
                  remain on this machine.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="main-stack">
        <ErrorBox error={error} />
        {actionMessage && (
          <SuccessBox>
            <div className="font-semibold">{actionMessage}</div>
          </SuccessBox>
        )}
        <Panel className="library-results-section">
          <div className="library-results-header">
            <div>
              <div className="eyebrow">My Library</div>
              <h2>
                {filteredEntries.length} shown · {combinedEntries.length} total
              </h2>
            </div>
            <span className="flat-status">
              {subscribedIndexEntries.length > 0
                ? `${subscribedIndexEntries.length} subscribed online`
                : publicIndex
                  ? `${publicIndex.package_count} in index`
                  : "index not checked"}
            </span>
          </div>
          <div className="library-toolbar">
            <Field
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Search title, tag, component, source…"
            />
            <select
              value={librarySettings.libraryViewMode}
              onChange={(e) =>
                saveLibrarySettings({
                  libraryViewMode: e.target.value as BrowserDisplayMode,
                })
              }
            >
              <option value="list">List view</option>
              <option value="cards">Large cards</option>
            </select>
            <select
              value={libraryFilter}
              onChange={(e) =>
                setLibraryFilter(e.target.value as typeof libraryFilter)
              }
            >
              <option value="all">All entries</option>
              <option value="local">On this device</option>
              <option value="remote">Remote sources</option>
              <option value="offline">Offline</option>
              <option value="server">Server only</option>
              <option value="online">Online</option>
              <option value="subscribed">Subscribed, not downloaded</option>
              <option value="removed">Removed from Exchange</option>
              <option value="failed">Needs attention</option>
              <option value="blocked">Blocked from sharing</option>
              <option value="restricted">Restricted</option>
              <option value="potentially_illegal">Potentially illegal</option>
            </select>
            {storedAdminToken().trim() && (
              <span
                className="flat-status"
                title="Moderation policy is managed from Admin. Publishing asks the registry to enforce blocked hashes."
              >
                moderation active
              </span>
            )}
          </div>
          {combinedEntries.length === 0 ? (
            <p className="empty-small">
              No MCDF entries yet. Add an MCDF from this device, a remote
              source, or an Exchange subscription to start building the
              browsable library.
            </p>
          ) : filteredEntries.length === 0 ? (
            <p className="empty-small">No entries match this search/filter.</p>
          ) : librarySettings.libraryViewMode === "list" ? (
            <div
              className="library-table"
              role="table"
              aria-label="My Library entries"
            >
              <div className="library-table-header" role="row">
                <span>Name</span>
                <span>Files</span>
                <span>Size</span>
                <span>Exchange</span>
                <span>Sharing</span>
                <span>Blocking file</span>
                <span>18+</span>
                <span>Tags / labels</span>
                <span>Actions</span>
              </div>
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`library-table-row ${selectedEntry?.id === entry.id ? "selected-row" : ""}`}
                  role="row"
                >
                  <button
                    type="button"
                    className="table-cell-button table-title"
                    onClick={() => selectEntry(entry)}
                  >
                    {entry.title && !entry.title.includes("\\")
                      ? entry.title
                      : basename(
                          entry.original_filename ||
                            entry.local_path ||
                            entry.title ||
                            "Untitled MCDF",
                        )}
                  </button>
                  <button
                    type="button"
                    className="table-cell-button"
                    onClick={() => selectEntry(entry)}
                  >
                    {entry.file_count}
                  </button>
                  <button
                    type="button"
                    className="table-cell-button"
                    onClick={() => selectEntry(entry)}
                  >
                    {formatBytes(entry.total_file_bytes)}
                  </button>
                  <button
                    type="button"
                    className={`table-cell-button table-tick ${entryPublicClass(entry) === "status-good" ? "yes" : entryPublicClass(entry) === "status-bad" ? "no" : "partial"}`}
                    onClick={() => selectEntry(entry)}
                  >
                    {entryPublicLabel(entry)}
                  </button>
                  <button
                    type="button"
                    className={`table-cell-button table-tick ${entry.sharing_policy?.status === "blocked" ? "no loud" : "yes quiet"}`}
                    title={sharingPolicyDetailLabel(entry)}
                    onClick={() => selectEntry(entry)}
                  >
                    {sharingPolicyLabel(entry)}
                  </button>
                  <button
                    type="button"
                    className="table-cell-button table-reason-file"
                    title={sharingReasonFile(entry)}
                    onClick={() => selectEntry(entry)}
                  >
                    {sharingReasonFile(entry)}
                  </button>
                  <button
                    type="button"
                    className={`table-cell-button table-tick ${entryIsAdult(entry) ? "adult" : "no"}`}
                    onClick={() => selectEntry(entry)}
                  >
                    {entryIsAdult(entry) ? "18+" : "—"}
                  </button>
                  <button
                    type="button"
                    className="table-cell-button table-tags"
                    onClick={() => selectEntry(entry)}
                  >
                    {localEntryManualTags(entry)
                      .slice(0, 2)
                      .map((tag) => `#${tag}`)
                      .concat(localEntrySystemLabels(entry).slice(0, 3))
                      .join(" · ") || "—"}
                  </button>
                  <LibraryEntryActions entry={entry} compact />
                </div>
              ))}
            </div>
          ) : (
            <div className="browse-results card-grid library-card-grid">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`library-card ${selectedEntry?.id === entry.id ? "selected-row" : ""}`}
                >
                  <button
                    type="button"
                    className="library-row-main"
                    onClick={() => selectEntry(entry)}
                  >
                    <PreviewTile
                      image={entry.preview_image_path}
                      title={entry.title || entry.original_filename}
                      adult={entryIsAdult(entry)}
                    />
                    <strong>
                      {entry.title && !entry.title.includes("\\")
                        ? entry.title
                        : basename(
                            entry.original_filename ||
                              entry.local_path ||
                              entry.title ||
                              "Untitled MCDF",
                          )}
                    </strong>
                    <span>
                      {entry.file_count} files ·{" "}
                      {formatBytes(entry.total_file_bytes)}
                    </span>
                    {entry.sharing_policy?.status === "blocked" && (
                      <span className="card-blocked-line">
                        Disallowed · {entry.sharing_policy.label} ·{" "}
                        {sharingReasonFile(entry)}
                      </span>
                    )}
                    <code>
                      {localEntryManualTags(entry)
                        .slice(0, 3)
                        .map((tag) => `#${tag}`)
                        .concat(localEntrySystemLabels(entry).slice(0, 4))
                        .join(" · ") || "No tags or labels yet"}
                    </code>
                  </button>
                  <LibraryEntryActions entry={entry} />
                  <div className="state-pill-stack">
                    {(entryListedPublicly(entry) ||
                      entry.storage_state === "removed" ||
                      entry.storage_state === "subscribed") && (
                      <span
                        className={`status-pill ${entryPublicClass(entry)}`}
                      >
                        {entryPublicLabel(entry)}
                      </span>
                    )}
                    {entry.sharing_policy?.status === "blocked" && (
                      <span
                        className={`status-pill ${sharingPolicyClass(entry.sharing_policy)}`}
                      >
                        Disallowed
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
      {selectedEntry && detailsPaneOpen && (
        <aside className="right-stack elevated-detail-pane">
          <Panel className="entry-detail-card">
            <button
              type="button"
              className="entry-detail-preview entry-detail-preview-button"
              disabled={
                loading ||
                selectedEntry.storage_state === "subscribed" ||
                selectedEntry.storage_state === "removed"
              }
              onClick={choosePreview}
              title="Change MCDF preview image"
            >
              {publishPreviewPath ? (
                <img
                  src={displayImageSrc(publishPreviewPath) || undefined}
                  alt={publishTitle || selectedEntry.original_filename}
                />
              ) : (
                <div className="preview-placeholder large">✧</div>
              )}
              {selectedEntry.storage_state !== "subscribed" &&
                selectedEntry.storage_state !== "removed" && (
                  <span className="preview-edit-chip">Change picture</span>
                )}
            </button>
            <div className="entry-detail-pill-row">
              {detailStatusPills(selectedEntry).map((pill) => (
                <span
                  key={`${pill.label}-${pill.className}`}
                  className={`status-pill ${pill.className}`}
                >
                  {pill.label}
                </span>
              ))}
            </div>
            <div className="panel-title-row detail-title-row">
              <div>
                <div className="eyebrow">Entry details</div>
                <h2>
                  {selectedEntry.title && !selectedEntry.title.includes("\\")
                    ? selectedEntry.title
                    : basename(
                        selectedEntry.original_filename ||
                          selectedEntry.local_path ||
                          selectedEntry.title ||
                          "Untitled MCDF",
                      )}
                </h2>
              </div>
              <div className="detail-title-actions">
                {!editEntryDetails &&
                selectedEntry.storage_state !== "subscribed" &&
                selectedEntry.storage_state !== "removed" ? (
                  <GhostButton
                    disabled={loading}
                    onClick={() => setEditEntryDetails(true)}
                  >
                    Edit
                  </GhostButton>
                ) : editEntryDetails ? (
                  <GhostButton
                    disabled={loading}
                    onClick={() => setEditEntryDetails(false)}
                  >
                    Done
                  </GhostButton>
                ) : null}
                <IconButton
                  label="Close details"
                  className="detail-close-button"
                  onClick={() => setDetailsPaneOpen(false)}
                >
                  ×
                </IconButton>
              </div>
            </div>
            {!editEntryDetails ? (
              <div className="published-detail">
                <p>
                  {selectedEntry.description || "No description saved yet."}
                </p>
                {localEntryManualTags(selectedEntry).length > 0 && (
                  <div className="tag-group">
                    <span className="tag-group-title">User tags</span>
                    <div className="tag-row">
                      {localEntryManualTags(selectedEntry).map((tag) => (
                        <span key={tag}>#{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
                {localEntrySystemLabels(selectedEntry).length > 0 && (
                  <div className="tag-group">
                    <span className="tag-group-title">Package labels</span>
                    <div className="tag-row label-row">
                      {localEntrySystemLabels(selectedEntry).map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="published-detail">
                <Field
                  value={publishTitle}
                  onChange={(e) => setPublishTitle(e.target.value)}
                  placeholder="Public title"
                />
                <Field
                  value={publishTags}
                  onChange={(e) => setPublishTags(e.target.value)}
                  placeholder="Tags, comma separated"
                />
                <Field
                  value={publishDescription}
                  onChange={(e) => setPublishDescription(e.target.value)}
                  placeholder="Public description"
                />
                <label className="form-label">Visibility</label>
                <select
                  value={publishVisibility}
                  onChange={(e) =>
                    setPublishVisibility(e.target.value as McdfVisibility)
                  }
                >
                  <option value="public">Public in The Eorzea Exchange</option>
                  <option value="locked">
                    Locked — listed by server only, access requires approval
                  </option>
                  <option value="private">Private/server-only</option>
                </select>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={publishIsAdult}
                    onChange={(e) => setPublishIsAdult(e.target.checked)}
                  />{" "}
                  <span>Mark this MCDF as 18+</span>
                </label>
                <div className="hero-actions">
                  <GhostButton disabled={loading} onClick={choosePreview}>
                    {publishPreviewPath ? "Change picture" : "Add picture"}
                  </GhostButton>
                  {publishPreviewPath && (
                    <GhostButton disabled={loading} onClick={clearPreview}>
                      Remove picture
                    </GhostButton>
                  )}
                  <GhostButton disabled={loading} onClick={saveMetadata}>
                    Save locally
                  </GhostButton>
                </div>
              </div>
            )}
            {selectedEntry.source_url && (
              <div className="source-annotation">
                <strong>Remote source</strong>
                <span>
                  {selectedEntry.remote_annotation ||
                    "This entry lives outside the local library until you choose to mirror or archive it."}
                </span>
              </div>
            )}
            {selectedEntry.missing_registry_percent != null && (
              <div className="source-annotation">
                <strong>Registry gap</strong>
                <span>
                  {selectedEntry.missing_registry_percent}% missing in online
                  storage, based on last temp scan.
                </span>
              </div>
            )}
            {selectedEntry.sharing_policy &&
              selectedEntry.sharing_policy.status !== "allowed" && (
                <div className="upload-responsibility-notice policy-block-notice">
                  <strong>{selectedEntry.sharing_policy.label}</strong>
                  <p>
                    {selectedEntry.sharing_policy.summary} This entry stays
                    available locally, but MCDF Manager blocks upload and
                    sharing.
                  </p>
                  <div className="policy-match-list">
                    {selectedEntry.sharing_policy.matches
                      .slice(0, 6)
                      .map((match) => (
                        <div
                          key={`${match.target_type}-${match.hash_blake3}`}
                          className="policy-match-row"
                        >
                          <span>
                            {match.target_type === "package"
                              ? "Package"
                              : match.file_path || "Unknown file"}
                          </span>
                          <code>{shortHash(match.hash_blake3)}</code>
                          <em>{match.reason}</em>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            {selectedEntry.storage_state !== "subscribed" &&
              selectedEntry.storage_state !== "removed" &&
              !publishingRulesAccepted && (
                <div className="upload-responsibility-notice">
                  <strong>Publishing rules</strong>
                  <p>
                    Accept the current publishing rules once before publishing.
                    You will only be asked again when the rules document version
                    changes.
                  </p>
                  <div className="hero-actions compact-actions">
                    <GhostButton
                      disabled={loading}
                      onClick={() => setPublishingRulesOpen(true)}
                    >
                      Read and accept rules
                    </GhostButton>
                  </div>
                </div>
              )}
            <div className="detail-action-panel">
              <div>
                <div className="eyebrow">Entry actions</div>
                <p className="empty-small">
                  Share public Exchange entries, export or download the MCDF,
                  publish updates, or remove the local record.
                </p>
              </div>
              <LibraryEntryActions entry={selectedEntry} />
              {storedAdminToken().trim() && (
                <GhostButton
                  disabled={loading}
                  onClick={() => void refreshSelectedSharingPolicy()}
                  title="Refresh this entry against the admin moderation blocklist. No MCDF bytes are uploaded."
                >
                  Refresh moderation status
                </GhostButton>
              )}
            </div>
            {!hasStoredClientAuth() && (
              <p className="empty-small">
                Connect and authorize this client before publishing.
              </p>
            )}
            {selectedEntry.storage_state === "subscribed" && (
              <div className="alert success">
                <div className="font-semibold">Subscribed online MCDF</div>
                <p className="empty-small">
                  This Exchange item is tracked in My Library locally, but the
                  MCDF has not been downloaded yet. Downloading public entries
                  does not require connecting to the archive service; server
                  connection is only needed for private requests, reports, admin
                  actions, or cloud-sync later.
                </p>
                <PrimaryButton
                  disabled={loading}
                  onClick={() => void downloadSubscribedEntry()}
                >
                  {loading ? "Downloading…" : "Download MCDF"}
                </PrimaryButton>
              </div>
            )}
            {selectedEntry.storage_state === "removed" && (
              <div className="alert error">
                <div className="font-semibold">
                  Removed from The Eorzea Exchange
                </div>
                <p className="empty-small">
                  This MCDF was in your local subscriptions, but it is no longer
                  available in the public Exchange index. The local subscription
                  record is kept so you can see that it was removed instead of
                  silently disappearing.
                </p>
              </div>
            )}
            {isRemoteEntry(selectedEntry) &&
              selectedEntry.storage_state !== "subscribed" &&
              selectedEntry.storage_state !== "removed" && (
                <p className="empty-small">
                  Remote entries remain in My Library as source references. Use
                  Add MCDF or Publish with a supported source to publish them.
                </p>
              )}
            {friendlyPublishNotes(selectedEntry).length > 0 && (
              <div className="publish-result-summary mt-2">
                {friendlyPublishNotes(selectedEntry).map((note, index) => (
                  <p key={index}>{note}</p>
                ))}
              </div>
            )}
          </Panel>
        </aside>
      )}
    </div>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function createPublisherKeyMaterial(displayName: string) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicKey = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const publicKeyB64 = arrayBufferToBase64(publicKey);
  const privateKeyB64 = arrayBufferToBase64(privateKey);
  localStorage.setItem("mcdf.publisher.privateKey.pkcs8", privateKeyB64);
  localStorage.setItem("mcdf.publisher.publicKey.spki", publicKeyB64);
  localStorage.setItem("mcdf.publisher.displayName", displayName);
  return { publicKeyB64, privateKeyB64 };
}

type SharedArchiveConnectModalProps = {
  onClose: () => void;
  onConnected: (
    health: CentralServerHealth,
    config: ArchiveConfigResponse | null,
  ) => void;
};

function SharedArchiveConnectModal({
  onClose,
  onConnected,
}: SharedArchiveConnectModalProps) {
  const [serverUrl] = useState(configuredArchiveHost());
  const [displayName, setDisplayName] = useState(
    localStorage.getItem("mcdf.publisher.displayName") || "",
  );
  const [serverToken, setServerToken] = useState(storedAdminToken());
  const [serverHealth, setServerHealth] = useState<CentralServerHealth | null>(
    null,
  );
  const [archiveConfig, setArchiveConfig] =
    useState<ArchiveConfigResponse | null>(null);
  const [publisherIdentity, setPublisherIdentity] =
    useState<PublisherIdentityRecord | null>(null);
  const [clientAuthPackagePath, setClientAuthPackagePath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const tokenRequired = Boolean(
    serverHealth?.uploads_require_auth ||
    archiveConfig?.uploads?.requires_token,
  );
  const clientAuthorized = hasStoredClientAuth();

  useEffect(() => {
    let cancelled = false;
    const discover = async () => {
      setLoading(true);
      setError(null);
      try {
        const health = await invoke<CentralServerHealth>(
          "central_server_health",
          { serverUrl },
        );
        if (cancelled) return;
        setServerHealth(health);
        try {
          const config = await invoke<ArchiveConfigResponse>(
            "fetch_archive_config",
            { serverUrl },
          );
          if (!cancelled) setArchiveConfig(config);
        } catch {
          if (!cancelled) setArchiveConfig(null);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    discover();
    return () => {
      cancelled = true;
    };
  }, [serverUrl]);

  const importClientAuth = async () => {
    setLoading(true);
    setError(null);
    setClientAuthPackagePath("");
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          { name: "MCDF Client Auth", extensions: ["mcdfauth", "json"] },
        ],
      });
      if (!selected || Array.isArray(selected)) return;
      const authPackage = await invoke<ClientAuthExportPackage>(
        "import_client_auth_package",
        { path: selected },
      );
      localStorage.setItem(
        "mcdf.publisher.privateKey.pkcs8",
        authPackage.private_key,
      );
      localStorage.setItem(
        "mcdf.publisher.publicKey.spki",
        authPackage.public_key,
      );
      localStorage.setItem(
        "mcdf.publisher.certificate",
        authPackage.certificate,
      );
      localStorage.setItem(
        "mcdf.publisher.username",
        authPackage.username || authPackage.publisher_id,
      );
      localStorage.setItem(
        "mcdf.publisher.displayName",
        authPackage.display_name,
      );
      setDisplayName(authPackage.display_name);
      setPublisherIdentity({
        schema_version: 1,
        publisher_id: authPackage.publisher_id,
        username: authPackage.username || authPackage.publisher_id,
        display_name: authPackage.display_name,
        public_key: authPackage.public_key,
        certificate: authPackage.certificate,
        status: "imported",
        source: "imported_client_auth_package",
        created_at: authPackage.exported_at,
        updated_at: new Date().toISOString(),
        notes: [
          "Imported from a client auth package. This installation can now prove the same publisher identity.",
        ],
      });
      notifyClientAuthChanged();
      setClientAuthPackagePath(selected);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const authorizeAndConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const health =
        serverHealth ||
        (await invoke<CentralServerHealth>("central_server_health", {
          serverUrl,
        }));
      let config = archiveConfig;
      try {
        config =
          config ||
          (await invoke<ArchiveConfigResponse>("fetch_archive_config", {
            serverUrl,
          }));
        setArchiveConfig(config);
      } catch {
        config = null;
      }
      const needsToken = Boolean(
        health.uploads_require_auth || config?.uploads?.requires_token,
      );
      if (needsToken && !serverToken.trim()) {
        throw new Error(
          "This archive service requires an upload token before it can authorize this client.",
        );
      }
      if (serverToken.trim()) {
        await saveAdminToken(serverToken.trim());
      }
      if (!hasStoredClientAuth()) {
        const name = displayName.trim();
        if (!name)
          throw new Error(
            "Enter the display name people will see on shared MCDF uploads.",
          );
        const username = displayNameToUsername(name);
        const { publicKeyB64 } = await createPublisherKeyMaterial(name);
        localStorage.setItem("mcdf.publisher.username", username);
        const identity = await invoke<PublisherIdentityRecord>(
          "issue_publisher_certificate",
          {
            serverUrl,
            bearerToken: serverToken.trim() || null,
            username,
            displayName: name,
            label: username,
            publicKey: publicKeyB64,
          },
        );
        localStorage.setItem(
          "mcdf.publisher.certificate",
          identity.certificate || "",
        );
        setPublisherIdentity(identity);
        notifyClientAuthChanged();
      }
      localStorage.setItem("mcdf.archive.host", serverUrl);
      onConnected(health, config);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="connect-modal glass-panel">
        <div className="panel-title-row">
          <div>
            <div className="eyebrow">Register</div>
            <h2>{clientAuthorized ? "Connect" : "Register and Connect"}</h2>
          </div>
        </div>
        <p>
          Register when you want to make use of community services or want to
          upload Character files. Browsing the exchange does not require an
          account.
        </p>
        {!clientAuthorized && (
          <>
            <p>
              Enter the display name shown on your profile, or import an
              existing <span className="inline-code">.mcdfauth</span> package
              from another computer.
            </p>
            <div className="form-grid single-column">
              <Field
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                autoFocus
              />
            </div>
          </>
        )}
        {tokenRequired && (
          <div className="form-grid single-column">
            <Field
              value={serverToken}
              onChange={(e) => setServerToken(e.target.value)}
              placeholder="Token"
            />
          </div>
        )}
        <ErrorBox error={error} />
        {publisherIdentity && (
          <SuccessBox>
            <div className="font-semibold">
              Connected as {publisherIdentity.display_name}
            </div>
            <div className="mt-2">
              You can export a <span className="inline-code">.mcdfauth</span>{" "}
              package later if you move computers.
            </div>
          </SuccessBox>
        )}
        {clientAuthPackagePath && (
          <SuccessBox>
            <div className="font-semibold">Imported client auth</div>
            <div className="mt-2 font-mono text-xs">
              {clientAuthPackagePath}
            </div>
          </SuccessBox>
        )}
        <div className="hero-actions modal-actions">
          {!clientAuthorized && (
            <GhostButton disabled={loading} onClick={importClientAuth}>
              Import
            </GhostButton>
          )}
          <PrimaryButton
            disabled={loading || Boolean(error && !serverHealth)}
            onClick={authorizeAndConnect}
          >
            {loading
              ? "Working…"
              : clientAuthorized
                ? "Connect"
                : "Register and Connect"}
          </PrimaryButton>
          <GhostButton disabled={loading} onClick={onClose}>
            Cancel
          </GhostButton>
        </div>
      </div>
    </div>
  );
}

function EndUserLicenseAgreementModal({ onAccept }: { onAccept: () => void }) {
  const accept = () => {
    acceptEula();
    onAccept();
  };
  return (
    <div
      className="modal-backdrop eula-backdrop"
      role="dialog"
      aria-modal="true"
    >
      <div className="connect-modal glass-panel eula-modal">
        <div className="panel-title-row">
          <div>
            <div className="eyebrow">End User License Agreement</div>
            <h2>MCDF Manager use and upload terms</h2>
          </div>
        </div>
        <div className="eula-scroll">
          <p>
            <strong>You are responsible for your use of MCDF Manager.</strong>{" "}
            Use the application only for content and activity you are allowed to
            perform.
          </p>
          <p>
            <strong>
              You may upload or publish content only when you have the right to
              share it.
            </strong>{" "}
            That includes MCDF packages, preview images, descriptions, tags,
            labels, source links, and creator/profile information.
          </p>
          <p>
            <strong>
              You may not upload or publish stolen, leaked, private, restricted,
              malicious, misleading, or unauthorized content.
            </strong>{" "}
            Do not upload content that violates another person's rights, a
            creator's terms, community rules, platform rules, or applicable law.
          </p>
          <p>
            <strong>
              You must mark adult or sensitive content accurately where the
              product provides those controls.
            </strong>{" "}
            Do not misrepresent sexual, adult, age-sensitive, or restricted
            content.
          </p>
          <p>
            <strong>
              MCDF Manager and its operators do not own, approve, or take
              responsibility for user-submitted content.
            </strong>{" "}
            You remain responsible for rights, permission, consent, legality,
            labels, descriptions, and consequences of publishing.
          </p>
          <p>
            <strong>Moderation may happen.</strong> Content or accounts may be
            removed, hidden, blocked, restricted, or reported when they violate
            these terms, community rules, law, safety requirements, or
            moderation decisions.
          </p>
        </div>
        <div className="hero-actions modal-actions">
          <PrimaryButton onClick={accept}>Accept and continue</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function PublishingRulesModal({
  onClose,
  onAccept,
}: {
  onClose: () => void;
  onAccept: () => void;
}) {
  return (
    <div
      className="modal-backdrop eula-backdrop"
      role="dialog"
      aria-modal="true"
    >
      <div className="connect-modal glass-panel eula-modal publishing-rules-modal">
        <div className="panel-title-row">
          <div>
            <div className="eyebrow">
              Publishing rules · version {PUBLISHING_RULES_VERSION}
            </div>
            <h2>Before you publish</h2>
          </div>
          <IconButton label="Close publishing rules" onClick={onClose}>
            ×
          </IconButton>
        </div>
        <div className="eula-scroll">
          <p>
            <strong>You are responsible for what you publish.</strong> Only
            upload MCDF packages, preview images, descriptions, tags, and source
            links that you are allowed to share.
          </p>
          <p>
            MCDF Manager does not verify ownership, consent, copyright, model
            permissions, game-mod permissions, or platform/community-rule
            compliance for you.
          </p>
          <p>
            Do not upload private, confidential, restricted, stolen, leaked, or
            otherwise unauthorized files. Do not upload files that violate
            another person’s rights or the rules of communities and services you
            use.
          </p>
          <p>
            Published files and assets are not private personal storage. Do not
            publish anything that must stay private, confidential, or
            restricted.
          </p>
          <p>
            You will only be asked to accept these publishing rules again when
            the publishing rules document changes.
          </p>
        </div>
        <div className="hero-actions modal-actions">
          <PrimaryButton onClick={onAccept}>
            Accept current publishing rules
          </PrimaryButton>
          <GhostButton onClick={onClose}>Close</GhostButton>
        </div>
      </div>
    </div>
  );
}

function StorageFoldersPanel({
  compact = false,
  onSaved,
}: {
  compact?: boolean;
  onSaved?: (settings: StorageSettingsResponse) => void;
}) {
  const [settings, setSettings] = useState<StorageSettingsResponse | null>(
    null,
  );
  const [libraryDir, setLibraryDir] = useState("");
  const [exchangeCacheDir, setExchangeCacheDir] = useState("");
  const [downloadsDir, setDownloadsDir] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = async () => {
    setError(null);
    try {
      const value = await invoke<StorageSettingsResponse>(
        "get_storage_settings",
      );
      setSettings(value);
      setLibraryDir(value.library_dir);
      setExchangeCacheDir(value.exchange_cache_dir);
      setDownloadsDir(value.downloads_dir);
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    loadSettings();
  }, []);

  const chooseFolder = async (setter: (value: string) => void) => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (selected && !Array.isArray(selected)) setter(selected);
  };

  const saveFolders = async () => {
    setLoading(true);
    setError(null);
    try {
      const update: StorageSettingsUpdateRequest = {
        library_dir: libraryDir.trim() || null,
        exchange_cache_dir: exchangeCacheDir.trim() || null,
        downloads_dir: downloadsDir.trim() || null,
        initialized: true,
      };
      const next = await invoke<StorageSettingsResponse>(
        "save_storage_settings",
        { update },
      );
      setSettings(next);
      setLibraryDir(next.library_dir);
      setExchangeCacheDir(next.exchange_cache_dir);
      setDownloadsDir(next.downloads_dir);
      acknowledgeStorageSetup();
      onSaved?.(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel
      className={
        compact ? "storage-setup-panel compact" : "storage-setup-panel"
      }
    >
      <div className="panel-title-row">
        <div>
          <div className="eyebrow">Local storage</div>
          <h2>Library and Exchange folders</h2>
        </div>
        {settings && (
          <span
            className={
              settings.initialized
                ? "status-pill status-good"
                : "status-pill status-warn"
            }
          >
            {settings.initialized ? "configured" : "setup needed"}
          </span>
        )}
      </div>
      <p>
        Choose where MCDF Manager stores your library metadata and rebuilt
        downloads. Cache maintenance appears in notifications when it needs
        attention.
      </p>
      <div className="storage-folder-grid">
        <label>
          <span>My Library folder</span>
          <div className="folder-row">
            <Field
              value={libraryDir}
              onChange={(e) => setLibraryDir(e.target.value)}
              placeholder="Local library folder"
            />
            <GhostButton onClick={() => chooseFolder(setLibraryDir)}>
              Browse
            </GhostButton>
          </div>
        </label>
        <label>
          <span>Exchange cache folder</span>
          <div className="folder-row">
            <Field
              value={exchangeCacheDir}
              onChange={(e) => setExchangeCacheDir(e.target.value)}
              placeholder="Downloaded file-part cache"
            />
            <GhostButton onClick={() => chooseFolder(setExchangeCacheDir)}>
              Browse
            </GhostButton>
          </div>
        </label>
        <label>
          <span>Downloads folder</span>
          <div className="folder-row">
            <Field
              value={downloadsDir}
              onChange={(e) => setDownloadsDir(e.target.value)}
              placeholder="Rebuilt MCDF downloads"
            />
            <GhostButton onClick={() => chooseFolder(setDownloadsDir)}>
              Browse
            </GhostButton>
          </div>
        </label>
      </div>
      <div className="hero-actions">
        <PrimaryButton disabled={loading} onClick={saveFolders}>
          {loading ? "Saving…" : "Save storage folders"}
        </PrimaryButton>
        <GhostButton disabled={loading} onClick={loadSettings}>
          Reload
        </GhostButton>
      </div>
      <ErrorBox error={error} />
      {settings && (
        <div className="empty-small">
          Settings file:{" "}
          <span className="inline-code">{settings.settings_file}</span>
        </div>
      )}
      {settings?.notes?.map((note, index) => (
        <p key={index} className="empty-small">
          {note}
        </p>
      ))}
    </Panel>
  );
}

function FirstBootStorageModal({ onDone }: { onDone: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="connect-modal glass-panel storage-first-boot-modal">
        <div className="panel-title-row">
          <div>
            <div className="eyebrow">First boot</div>
            <h2>Choose local storage folders</h2>
          </div>
        </div>
        <p>
          MCDF Manager uses local folders for your Library, Exchange cache, and
          rebuilt downloads. You can use the defaults, choose new folders, or
          point the app at existing folders from another install.
        </p>
        <StorageFoldersPanel compact onSaved={onDone} />
        <div className="hero-actions modal-actions">
          <GhostButton
            onClick={() => {
              acknowledgeStorageSetup();
              onDone();
            }}
          >
            Use defaults for now
          </GhostButton>
        </div>
      </div>
    </div>
  );
}

function PublicProfileModal({ onClose }: { onClose: () => void }) {
  const [profile, setProfile] = useState(() => readPublicProfile());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportPath, setExportPath] = useState("");
  const publicKey =
    profile.publicKey ||
    localStorage.getItem("mcdf.publisher.publicKey.spki") ||
    "";
  const registeredAt =
    profile.registeredAt ||
    localStorage.getItem("mcdf.publisher.registeredAt") ||
    "";
  const chooseProfileImage = async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [
        {
          name: "Profile image",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"],
        },
      ],
    });
    if (!selected || Array.isArray(selected)) return;
    setProfile((current) => ({ ...current, image: selected }));
  };
  const exportClientAuthFromProfile = async () => {
    setError(null);
    setExportPath("");
    try {
      const privateKey =
        localStorage.getItem("mcdf.publisher.privateKey.pkcs8") || "";
      const certificate =
        localStorage.getItem("mcdf.publisher.certificate") || "";
      if (!privateKey || !publicKey || !certificate)
        throw new Error(
          "Register this client before exporting an auth package.",
        );
      const username =
        profile.username ||
        displayNameToUsername(profile.displayName || "publisher");
      const selected = await save({
        defaultPath: `${username}.mcdfauth`,
        filters: [
          { name: "MCDF Client Auth", extensions: ["mcdfauth", "json"] },
        ],
      });
      if (!selected) return;
      const authPackage: ClientAuthExportPackage = {
        schema_version: 1,
        package_kind: "mcdf-client-auth",
        exported_at: new Date().toISOString(),
        archive_host: configuredArchiveHost(),
        archive_endpoint: null,
        publisher_id: username,
        username,
        display_name: profile.displayName || username,
        public_key: publicKey,
        private_key: privateKey,
        certificate,
        ca_id: null,
        notes: [
          "This package proves publisher ownership on another computer.",
          "It contains the private key. Keep it private.",
        ],
      };
      const writtenPath = await invoke<string>("export_client_auth_package", {
        path: selected,
        authPackage,
      });
      setExportPath(writtenPath);
    } catch (e) {
      setError(String(e));
    }
  };
  const saveProfile = () => {
    savePublicProfile(profile);
    setMessage("Profile saved");
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-card profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Publisher profile"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-title-row refined-modal-head">
          <div>
            <div className="eyebrow">Profile</div>
            <h2>Public profile</h2>
          </div>
          <button
            type="button"
            className="modal-icon-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="profile-editor-grid">
          <button
            type="button"
            className="entry-detail-preview entry-detail-preview-button profile-picture-picker"
            onClick={chooseProfileImage}
            title="Choose profile picture"
          >
            {profile.image ? (
              <img
                src={displayImageSrc(profile.image) || undefined}
                alt={profile.displayName || "Profile"}
              />
            ) : (
              <div className="preview-placeholder large">✧</div>
            )}
            <span className="preview-edit-chip">
              {profile.image ? "Change picture" : "Add picture"}
            </span>
          </button>
          <div className="form-grid single-column">
            <label>
              <span>Display name</span>
              <Field
                value={profile.displayName}
                onChange={(event) =>
                  setProfile({ ...profile, displayName: event.target.value })
                }
                placeholder="How people know you"
              />
            </label>
            <label>
              <span>Username</span>
              <Field
                value={
                  profile.username ||
                  displayNameToUsername(profile.displayName || "publisher")
                }
                disabled
                placeholder="Stable username"
              />
            </label>
            <label>
              <span>Flair</span>
              <Field
                value={profile.flair}
                onChange={(event) =>
                  setProfile({ ...profile, flair: event.target.value })
                }
                placeholder="Short profile line"
              />
            </label>
            <label>
              <span>Website</span>
              <Field
                value={profile.website}
                onChange={(event) =>
                  setProfile({ ...profile, website: event.target.value })
                }
                placeholder="https://…"
              />
            </label>
          </div>
        </div>
        <div className="profile-facts-grid">
          <div>
            <span>Public key</span>
            <code>{publicKey ? shortHash(publicKey) : "Not registered"}</code>
          </div>
          <div>
            <span>Profile</span>
            <strong>
              {registeredAt ? formatDate(registeredAt) : "Not registered"}
            </strong>
          </div>
        </div>
        <div className="hero-actions modal-actions">
          <PrimaryButton onClick={saveProfile}>Save profile</PrimaryButton>
          <GhostButton
            disabled={!hasStoredClientAuth()}
            onClick={exportClientAuthFromProfile}
          >
            Export auth package
          </GhostButton>
        </div>
        {message && (
          <SuccessBox>
            <div className="font-semibold">{message}</div>
          </SuccessBox>
        )}
        {exportPath && (
          <SuccessBox>
            <div className="font-semibold">Auth package exported</div>
            <div className="path-block">{exportPath}</div>
          </SuccessBox>
        )}
        <ErrorBox error={error} />
      </div>
    </div>
  );
}

function SettingsPanel({
  sharedArchiveConnected = false,
  onOpenConnect,
  onDisconnect,
}: {
  sharedArchiveConnected?: boolean;
  onOpenConnect: () => void;
  onDisconnect: () => void;
}) {
  const [cacheDir, setCacheDir] = useState("loading…");
  const [cacheResult, setCacheResult] = useState<CacheClearResult | null>(null);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [serverUsers, setServerUsers] = useState<UserPermissionRecord[]>([]);
  const [generatedToken, setGeneratedToken] =
    useState<GenerateAdminTokenResponse | null>(null);
  const [serverUrl, setServerUrl] = useState(configuredArchiveHost());
  const [archiveEndpoint, setArchiveEndpoint] = useState(
    "http://localhost:48443",
  );
  const [serverToken] = useState(storedAdminToken());
  const [adminToken, setAdminToken] = useState(storedAdminToken());
  const [publicIndexUrl] = useState(
    "https://raw.githubusercontent.com/obscure-crescent/moon-sparkles/main/public/indexes/latest.json",
  );
  const [publicIndex, setPublicIndex] = useState<PublicIndexLatest | null>(
    null,
  );
  const [indexDiagnostics, setIndexDiagnostics] =
    useState<PublicIndexDiagnosticsResponse | null>(null);
  const [indexSshKey, setIndexSshKey] = useState<IndexSshKeyResult | null>(
    null,
  );
  const [indexSshTest, setIndexSshTest] = useState<IndexSshTestResult | null>(
    null,
  );
  const [serverHealth, setServerHealth] = useState<CentralServerHealth | null>(
    null,
  );
  const [uploadResult, setUploadResult] =
    useState<CentralUploadResponse | null>(null);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishDescription, setPublishDescription] = useState("");
  const [publishTags, setPublishTags] = useState("");
  const [publishPreviewPath, setPublishPreviewPath] = useState<string | null>(
    null,
  );
  const [publisherIdentity, setPublisherIdentity] =
    useState<PublisherIdentityRecord | null>(null);
  const [publisherUsername, setPublisherUsername] = useState(
    localStorage.getItem("mcdf.publisher.username") || "",
  );
  const [publisherDisplayName, setPublisherDisplayName] = useState(
    localStorage.getItem("mcdf.publisher.displayName") || "",
  );
  const [clientAuthPackagePath, setClientAuthPackagePath] = useState("");
  const [selectedPublicPackage, setSelectedPublicPackage] =
    useState<PublicPackageRecord | null>(null);
  const [downloadResult, setDownloadResult] =
    useState<ArchiveDownloadResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [indexLoading, setIndexLoading] = useState(false);
  const [librarySettings, setLibrarySettings] = useState<LocalLibrarySettings>(
    () => readLibrarySettings(),
  );
  const [publishingRulesOpen, setPublishingRulesOpen] = useState(false);
  const saveLibraryVisibilitySettings = (
    patch: Partial<LocalLibrarySettings>,
  ) => {
    const next = { ...librarySettings, ...patch };
    setLibrarySettings(next);
    writeLibrarySettings(next);
    window.dispatchEvent(new Event("mcdf-library-settings-changed"));
  };
  const saveLocalPublisherProfile = () => {
    const displayName = publisherDisplayName.trim();
    const username = (
      publisherUsername.trim() ||
      displayNameToUsername(displayName || "publisher")
    ).toLowerCase();
    if (displayName)
      localStorage.setItem("mcdf.publisher.displayName", displayName);
    if (username) localStorage.setItem("mcdf.publisher.username", username);
    notifyClientAuthChanged();
  };
  useEffect(() => {
    invoke<StorageSettingsResponse>("get_storage_settings")
      .then((settings) => {
        setCacheDir(settings.exchange_cache_dir);
        if (settings.admin_token?.trim()) {
          setAdminToken(settings.admin_token.trim());
          localStorage.setItem(ADMIN_TOKEN_KEY, settings.admin_token.trim());
          localStorage.setItem(
            LEGACY_UPLOAD_TOKEN_KEY,
            settings.admin_token.trim(),
          );
        }
      })
      .catch((e) => setCacheDir(String(e)));
  }, []);
  const clearLocalCache = async () => {
    setServerLoading(true);
    setServerError(null);
    try {
      const result = await invoke<CacheClearResult>("clear_download_cache");
      setCacheResult(result);
      setCacheDir(result.cache_dir);
    } catch (error) {
      setServerError(String(error));
    } finally {
      setServerLoading(false);
    }
  };
  useEffect(() => {
    localStorage.setItem("mcdf.archive.host", serverUrl);
    invoke<string>("resolve_archive_endpoint", { serverUrl })
      .then(setArchiveEndpoint)
      .catch(() => setArchiveEndpoint(""));
  }, [serverUrl]);

  const testServer = async () => {
    setServerLoading(true);
    setServerError(null);
    setServerHealth(null);
    try {
      setServerHealth(
        await invoke<CentralServerHealth>("central_server_health", {
          serverUrl,
        }),
      );
    } catch (e) {
      setServerError(String(e));
    } finally {
      setServerLoading(false);
    }
  };

  const loadPublicIndex = async () => {
    setIndexLoading(true);
    setServerError(null);
    setPublicIndex(null);
    try {
      setPublicIndex(
        await invoke<PublicIndexLatest>("fetch_public_marketplace_index", {
          indexUrl: publicIndexUrl,
        }),
      );
    } catch (e) {
      setServerError(String(e));
    } finally {
      setIndexLoading(false);
    }
  };

  const loadIndexDiagnostics = async () => {
    setIndexLoading(true);
    setServerError(null);
    setIndexDiagnostics(null);
    try {
      setIndexDiagnostics(
        await invoke<PublicIndexDiagnosticsResponse>(
          "fetch_public_index_diagnostics",
          { serverUrl },
        ),
      );
    } catch (e) {
      setServerError(String(e));
    } finally {
      setIndexLoading(false);
    }
  };

  const ensureIndexSshKey = async () => {
    setIndexLoading(true);
    setServerError(null);
    try {
      setIndexSshKey(
        await invoke<IndexSshKeyResult>("ensure_public_index_ssh_key"),
      );
    } catch (e) {
      setServerError(String(e));
    } finally {
      setIndexLoading(false);
    }
  };

  const testIndexSshKey = async () => {
    setIndexLoading(true);
    setServerError(null);
    try {
      setIndexSshTest(
        await invoke<IndexSshTestResult>("test_public_index_ssh_key", {
          remote: null,
        }),
      );
    } catch (e) {
      setServerError(String(e));
    } finally {
      setIndexLoading(false);
    }
  };

  const exportClientAuth = async () => {
    setServerLoading(true);
    setServerError(null);
    setClientAuthPackagePath("");
    try {
      const privateKey =
        localStorage.getItem("mcdf.publisher.privateKey.pkcs8") || "";
      const publicKey =
        localStorage.getItem("mcdf.publisher.publicKey.spki") ||
        publisherIdentity?.public_key ||
        "";
      const certificate =
        localStorage.getItem("mcdf.publisher.certificate") ||
        publisherIdentity?.certificate ||
        "";
      const username =
        localStorage.getItem("mcdf.publisher.username") ||
        publisherIdentity?.username ||
        publisherIdentity?.publisher_id ||
        publisherUsername ||
        "publisher";
      const displayName =
        localStorage.getItem("mcdf.publisher.displayName") ||
        publisherIdentity?.display_name ||
        publisherDisplayName ||
        username;
      if (!privateKey || !publicKey || !certificate) {
        throw new Error(
          "Authorize this client or import an existing .mcdfauth package before exporting.",
        );
      }
      const selected = await save({
        defaultPath: `${username}.mcdfauth`,
        filters: [
          { name: "MCDF Client Auth", extensions: ["mcdfauth", "json"] },
        ],
      });
      if (!selected) return;
      const authPackage: ClientAuthExportPackage = {
        schema_version: 1,
        package_kind: "mcdf-client-auth",
        exported_at: new Date().toISOString(),
        archive_host: serverUrl,
        archive_endpoint: archiveEndpoint,
        publisher_id: publisherIdentity?.publisher_id || username,
        username,
        display_name: displayName,
        public_key: publicKey,
        private_key: privateKey,
        certificate,
        ca_id: serverHealth?.ca_id || null,
        notes: [
          "This package proves publisher ownership on another computer.",
          "It contains the private key. Keep it private and do not upload it to the public index.",
        ],
      };
      const writtenPath = await invoke<string>("export_client_auth_package", {
        path: selected,
        authPackage,
      });
      setClientAuthPackagePath(writtenPath);
    } catch (e) {
      setServerError(String(e));
    } finally {
      setServerLoading(false);
    }
  };

  const importClientAuth = async () => {
    setServerLoading(true);
    setServerError(null);
    setClientAuthPackagePath("");
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          { name: "MCDF Client Auth", extensions: ["mcdfauth", "json"] },
        ],
      });
      if (!selected || Array.isArray(selected)) return;
      const authPackage = await invoke<ClientAuthExportPackage>(
        "import_client_auth_package",
        { path: selected },
      );
      localStorage.setItem(
        "mcdf.publisher.privateKey.pkcs8",
        authPackage.private_key,
      );
      localStorage.setItem(
        "mcdf.publisher.publicKey.spki",
        authPackage.public_key,
      );
      localStorage.setItem(
        "mcdf.publisher.certificate",
        authPackage.certificate,
      );
      localStorage.setItem(
        "mcdf.publisher.username",
        authPackage.username || authPackage.publisher_id,
      );
      localStorage.setItem(
        "mcdf.publisher.displayName",
        authPackage.display_name,
      );
      setPublisherUsername(authPackage.username || authPackage.publisher_id);
      setPublisherDisplayName(authPackage.display_name);
      setPublisherIdentity({
        schema_version: 1,
        publisher_id: authPackage.publisher_id,
        username: authPackage.username || authPackage.publisher_id,
        display_name: authPackage.display_name,
        public_key: authPackage.public_key,
        certificate: authPackage.certificate,
        status: "imported",
        source: "imported_client_auth_package",
        created_at: authPackage.exported_at,
        updated_at: new Date().toISOString(),
        notes: [
          "Imported from a client auth package. This machine can now use the existing publisher ownership keypair.",
          "The public key remains the same publisher identity exported to the public index.",
        ],
      });
      notifyClientAuthChanged();
      if (authPackage.archive_host) setServerUrl(authPackage.archive_host);
      setClientAuthPackagePath(selected);
    } catch (e) {
      setServerError(String(e));
    } finally {
      setServerLoading(false);
    }
  };

  const inspectPublicPackage = async (pkg: PublicIndexPackageSummary) => {
    setIndexLoading(true);
    setServerError(null);
    setSelectedPublicPackage(null);
    try {
      setSelectedPublicPackage(
        await invoke<PublicPackageRecord>("fetch_public_package_record", {
          indexUrl: publicIndexUrl,
          packageManifestPath: pkg.package_manifest_path,
        }),
      );
    } catch (e) {
      setServerError(String(e));
    } finally {
      setIndexLoading(false);
    }
  };

  const downloadSelectedFromArchive = async () => {
    if (!selectedPublicPackage) return;
    const selected = await save({
      defaultPath: `${selectedPublicPackage.original_filename.replace(/\.mcdf$/i, "")}.rebuilt.mcdf`,
      filters: [{ name: "MCDF", extensions: ["mcdf"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    let metadataDescription = publishDescription.trim();
    if (!metadataDescription) {
      try {
        const scanned = await invoke<MCDFInfo>("scan_mcdf", { path: selected });
        metadataDescription = scanned.description || "";
        if (metadataDescription) setPublishDescription(metadataDescription);
      } catch {
        // Publishing can continue even when optional metadata pre-scan fails.
      }
    }
    setServerLoading(true);
    setServerError(null);
    setDownloadResult(null);
    try {
      setDownloadResult(
        await invoke<ArchiveDownloadResult>("download_package_from_archive", {
          serverUrl,
          packageHash: selectedPublicPackage.package_hash_blake3,
          outputPath: selected,
        }),
      );
    } catch (e) {
      setServerError(String(e));
    } finally {
      setServerLoading(false);
    }
  };

  const choosePublishPreview = async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [
        {
          name: "Preview image",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"],
        },
      ],
    });
    if (!selected || Array.isArray(selected)) return;
    setPublishPreviewPath(selected);
  };

  const uploadTestMcdf = async () => {
    if (!hasStoredClientAuth()) {
      setServerError(
        "Authorize and connect or import an existing .mcdfauth package before publishing.",
      );
      return;
    }
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: "MCDF", extensions: ["mcdf"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    let metadataDescription = publishDescription.trim();
    if (!metadataDescription) {
      try {
        const scanned = await invoke<MCDFInfo>("scan_mcdf", { path: selected });
        metadataDescription = scanned.description || "";
        if (metadataDescription) setPublishDescription(metadataDescription);
      } catch {
        // Publishing can continue even when optional metadata pre-scan fails.
      }
    }
    setServerLoading(true);
    setServerError(null);
    setUploadResult(null);
    try {
      setUploadResult(
        await invoke<CentralUploadResponse>("upload_mcdf_to_central_server", {
          path: selected,
          serverUrl,
          bearerToken: serverToken.trim() || null,
          title: publishTitle.trim() || null,
          description: metadataDescription || null,
          tags: tagsFromText(publishTags),
          previewImagePath: publishPreviewPath,
          isAdult: false,
          visibility: "public",
          ...localPublisherAuthHeaders(),
        }),
      );
    } catch (e) {
      setServerError(String(e));
    } finally {
      setServerLoading(false);
    }
  };

  const loadModerationReports = async () => {
    setReportsLoading(true);
    setReportsError(null);
    try {
      const result = await invoke<ReportListResponse>(
        "fetch_exchange_reports",
        {
          serverUrl: configuredArchiveHost(),
          bearerToken: archiveActionToken(),
        },
      );
      setReports(result.reports || []);
    } catch (error) {
      setReportsError(String(error));
    } finally {
      setReportsLoading(false);
    }
  };

  const reviewModerationReport = async (
    report: ReportRecord,
    status: "reviewed" | "dismissed",
  ) => {
    setReportsLoading(true);
    setReportsError(null);
    try {
      await invoke<ReportRecord>("review_exchange_report", {
        serverUrl: configuredArchiveHost(),
        bearerToken: archiveActionToken(),
        reportId: report.id,
        status,
        decisionNote:
          status === "dismissed"
            ? "Dismissed from admin moderation inbox"
            : "Marked reviewed from admin moderation inbox",
      });
      await loadModerationReports();
    } catch (error) {
      setReportsError(String(error));
    } finally {
      setReportsLoading(false);
    }
  };

  const removeReportedPackage = async (report: ReportRecord) => {
    if (
      !window.confirm(
        `Remove ${report.package_title || report.package_hash_blake3} from the Exchange?`,
      )
    )
      return;
    setReportsLoading(true);
    setReportsError(null);
    try {
      const removedHash = report.package_hash_blake3;
      await invoke<ReportRecord>("admin_remove_exchange_entry", {
        serverUrl: configuredArchiveHost(),
        bearerToken: archiveActionToken(),
        packageHashBlake3: removedHash,
        reason: `Removed from moderation inbox: ${report.reason}`,
      });
      setPublicIndex((current) =>
        current
          ? {
              ...current,
              packages: current.packages.filter(
                (entry) => entry.package_hash_blake3 !== removedHash,
              ),
              package_count: Math.max(0, current.package_count - 1),
            }
          : current,
      );
      await loadModerationReports();
    } catch (error) {
      setReportsError(String(error));
    } finally {
      setReportsLoading(false);
    }
  };

  const loadServerUsers = async () => {
    setReportsLoading(true);
    setReportsError(null);
    try {
      const result = await invoke<UserPermissionListResponse>(
        "fetch_server_user_permissions",
        {
          serverUrl: configuredArchiveHost(),
          bearerToken: archiveActionToken(),
        },
      );
      setServerUsers(result.users || []);
    } catch (error) {
      setReportsError(String(error));
    } finally {
      setReportsLoading(false);
    }
  };

  const setUserUploadPermission = async (
    user: UserPermissionRecord,
    canUpload: boolean,
  ) => {
    setReportsLoading(true);
    setReportsError(null);
    try {
      const updated = await invoke<UserPermissionRecord>(
        "update_server_user_upload_permission",
        {
          serverUrl: configuredArchiveHost(),
          bearerToken: archiveActionToken(),
          publisherId: user.publisher_id,
          canUpload,
        },
      );
      setServerUsers((users) =>
        users.map((item) =>
          item.publisher_id === updated.publisher_id ? updated : item,
        ),
      );
    } catch (error) {
      setReportsError(String(error));
    } finally {
      setReportsLoading(false);
    }
  };

  const generateReplacementAdminToken = async () => {
    if (!adminToken.trim()) {
      setReportsError(
        "Save an existing admin token before generating a replacement token.",
      );
      return;
    }
    if (
      !window.confirm(
        "Generate a new admin token on the server? Save the returned token immediately; the old token may stop working after rotation.",
      )
    )
      return;
    setReportsLoading(true);
    setReportsError(null);
    try {
      const result = await invoke<GenerateAdminTokenResponse>(
        "generate_admin_token",
        {
          serverUrl: configuredArchiveHost(),
          bearerToken: adminToken.trim(),
          label: "Generated from MCDF Manager Settings",
        },
      );
      setGeneratedToken(result);
      setAdminToken(result.token);
      void saveAdminToken(result.token);
    } catch (error) {
      setReportsError(String(error));
    } finally {
      setReportsLoading(false);
    }
  };

  const tokenConfigured = Boolean(adminToken.trim());
  return (
    <div className="settings-screen integrated-settings slim-settings">
      {publishingRulesOpen && (
        <PublishingRulesModal
          onClose={() => setPublishingRulesOpen(false)}
          onAccept={() => {
            acceptPublishingRules();
            setPublishingRulesOpen(false);
          }}
        />
      )}
      <StorageFoldersPanel
        onSaved={(settings) => setCacheDir(settings.exchange_cache_dir)}
      />
      <Panel>
        <div className="panel-title-row">
          <div>
            <div className="eyebrow">Token</div>
            <h2>Server token</h2>
          </div>
          <span
            className={
              tokenConfigured
                ? "status-pill status-good"
                : "status-pill status-neutral"
            }
          >
            {tokenConfigured ? "configured" : "not set"}
          </span>
        </div>
        {tokenConfigured ? (
          <div className="token-locked-state">
            <p className="empty-small">
              A server token is stored for this client. It remains the
              break-glass admin path even if a user certificate is revoked.
            </p>
            <Field type="password" value="••••••••••••••••" disabled readOnly />
          </div>
        ) : (
          <>
            <div className="form-grid single-column">
              <Field
                type="password"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder="Server token"
              />
            </div>
            <div className="hero-actions">
              <GhostButton onClick={() => void saveAdminToken(adminToken)}>
                Save token
              </GhostButton>
            </div>
          </>
        )}
      </Panel>
      <Panel>
        <div className="panel-title-row compact-setting-title">
          <div>
            <div className="eyebrow">Browsing visibility</div>
            <h2>18+ content</h2>
          </div>
          <span
            className={
              librarySettings.adultContentMode === "show"
                ? "status-pill status-warn"
                : "status-pill status-good"
            }
          >
            {librarySettings.adultContentMode === "show" ? "showing" : "hidden"}
          </span>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={librarySettings.adultContentMode === "show"}
            onChange={(event) =>
              saveLibraryVisibilitySettings({
                adultContentMode: event.target.checked ? "show" : "hide",
              })
            }
          />
          <span>Show 18+ content in browsing views</span>
        </label>
        <div className="settings-separator" />
        <div className="panel-title-row compact-setting-title">
          <div>
            <div className="eyebrow">Date display</div>
            <h2>Date format</h2>
          </div>
          <span className="status-pill status-neutral">
            {formatDate(
              new Date().toISOString(),
              librarySettings.dateDisplayMode,
            )}
          </span>
        </div>
        <select
          value={librarySettings.dateDisplayMode}
          onChange={(event) =>
            saveLibraryVisibilitySettings({
              dateDisplayMode: event.target.value as DateDisplayMode,
            })
          }
        >
          <option value="dmy">day-month-year</option>
          <option value="ymd">year-month-day</option>
          <option value="mdy">month-day-year</option>
          <option value="iso">ISO yyyy-mm-dd</option>
        </select>
      </Panel>
      <Panel>
        <div className="panel-title-row">
          <div>
            <div className="eyebrow">Legal</div>
            <h2>Publishing rules</h2>
          </div>
          <span
            className={
              hasAcceptedPublishingRules()
                ? "status-pill status-good"
                : "status-pill status-warn"
            }
          >
            {hasAcceptedPublishingRules()
              ? `accepted ${PUBLISHING_RULES_VERSION}`
              : "not accepted"}
          </span>
        </div>
        <div className="hero-actions">
          <GhostButton onClick={() => setPublishingRulesOpen(true)}>
            Read publishing rules
          </GhostButton>
        </div>
      </Panel>
      <ErrorBox error={serverError} />
    </div>
  );
}

function publicIndexAssetUrl(
  indexUrl: string,
  relativePath?: string | null,
): string | null {
  if (!relativePath) return null;
  const normalized = relativePath.replace(/^\/+/, "");
  const base = indexUrl
    .replace(/\\/g, "/")
    .replace(/public\/indexes\/latest\.json$/, "public/")
    .replace(/indexes\/latest\.json$/, "");
  return `${base}${normalized}`;
}

function publicIndexSiblingUrl(indexUrl: string, relativePath: string): string {
  return indexUrl
    .replace(/\\/g, "/")
    .replace(/indexes\/latest\.json$/, relativePath.replace(/^\/+/, ""));
}

async function fetchJsonFromIndex<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      `Index fetch failed ${response.status}: ${response.statusText}`,
    );
  return response.json() as Promise<T>;
}

function tagsFromText(text: string): string[] {
  return text
    .split(/[#,]/g)
    .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean)
    .slice(0, 32);
}

function PreviewTile({
  image,
  title,
  adult,
}: {
  image?: string | null;
  title: string;
  adult?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [image]);
  const safeImage = image && !imageFailed ? displayImageSrc(image) : null;
  return (
    <div className={`preview-tile ${safeImage ? "has-image" : "no-image"}`}>
      {safeImage ? (
        <img src={safeImage} alt={title} onError={() => setImageFailed(true)} />
      ) : (
        <div className="preview-placeholder">✧</div>
      )}
      {adult && <span className="adult-corner">18+</span>}
    </div>
  );
}

function SystemAdminPanel({
  sharedArchiveConnected,
}: {
  sharedArchiveConnected: boolean;
}) {
  const [adminToken, setAdminToken] = useState(storedAdminToken());
  const [publicIndexUrl] = useState(
    "https://raw.githubusercontent.com/obscure-crescent/moon-sparkles/main/public/indexes/latest.json",
  );
  const [publicIndex, setPublicIndex] = useState<PublicIndexLatest | null>(
    null,
  );
  const [publisherIndex, setPublisherIndex] =
    useState<PublicPublisherIndex | null>(null);
  const [serverUsers, setServerUsers] = useState<UserPermissionRecord[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [blocklist, setBlocklist] =
    useState<ModerationBlocklistResponse | null>(null);
  const [adminServerSettings, setAdminServerSettings] =
    useState<AdminServerSettings | null>(null);
  const [serverUploadMode, setServerUploadMode] = useState<
    "public" | "registered"
  >("registered");
  const [serverRequireToken, setServerRequireToken] = useState(false);
  const [serverPublicIndexEnabled, setServerPublicIndexEnabled] =
    useState(false);
  const [serverIncludePrivate, setServerIncludePrivate] = useState(false);
  const [selectedHash, setSelectedHash] = useState("");
  const [blockTargetType, setBlockTargetType] = useState<"package" | "file">(
    "package",
  );
  const [blockCategory, setBlockCategory] = useState("copyright-or-paid-mod");
  const [blockReason, setBlockReason] = useState(
    "Rights holder or moderation policy block",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usersFilter, setUsersFilter] = useState("");
  const [eventsFilter, setEventsFilter] = useState("");
  const [packagesFilter, setPackagesFilter] = useState("");
  const [usersPage, setUsersPage] = useState(0);
  const [eventsPage, setEventsPage] = useState(0);
  const [packagesPage, setPackagesPage] = useState(0);
  const [indexDiagnostics, setIndexDiagnostics] =
    useState<PublicIndexDiagnosticsResponse | null>(null);
  const [indexSshKey, setIndexSshKey] = useState<IndexSshKeyResult | null>(
    null,
  );
  const [indexSshTest, setIndexSshTest] = useState<IndexSshTestResult | null>(
    null,
  );

  const loadIndexDiagnostics = async () => {
    setLoading(true);
    setError(null);
    setIndexDiagnostics(null);
    try {
      setIndexDiagnostics(
        await invoke<PublicIndexDiagnosticsResponse>(
          "fetch_public_index_diagnostics",
          { serverUrl: configuredArchiveHost() },
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };
  const ensureIndexSshKey = async () => {
    setLoading(true);
    setError(null);
    try {
      setIndexSshKey(
        await invoke<IndexSshKeyResult>("ensure_public_index_ssh_key"),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };
  const testIndexSshKey = async () => {
    setLoading(true);
    setError(null);
    try {
      setIndexSshTest(
        await invoke<IndexSshTestResult>("test_public_index_ssh_key", {
          remote: null,
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const refreshToken = () => setAdminToken(storedAdminToken());
    window.addEventListener("mcdf-admin-token-changed", refreshToken);
    window.addEventListener("storage", refreshToken);
    refreshToken();
    return () => {
      window.removeEventListener("mcdf-admin-token-changed", refreshToken);
      window.removeEventListener("storage", refreshToken);
    };
  }, []);

  const packageCountByOwner = useMemo(() => {
    const map = new Map<string, number>();
    for (const pkg of publicIndex?.packages || [])
      map.set(pkg.owner_public_id, (map.get(pkg.owner_public_id) || 0) + 1);
    return map;
  }, [publicIndex]);
  const totalFiles = useMemo(
    () =>
      (publicIndex?.packages || []).reduce(
        (sum, pkg) => sum + pkg.file_count,
        0,
      ),
    [publicIndex],
  );
  const totalBytes = useMemo(
    () =>
      (publicIndex?.packages || []).reduce(
        (sum, pkg) => sum + pkg.total_file_bytes,
        0,
      ),
    [publicIndex],
  );
  const paidLikeCount = useMemo(
    () =>
      (publicIndex?.packages || []).filter((pkg) =>
        (pkg.tags || []).some((tag) =>
          /paid|premium|commission|ko-fi|patreon/i.test(tag),
        ),
      ).length,
    [publicIndex],
  );

  const loadGithubEnvironment = async () => {
    setLoading(true);
    setError(null);
    try {
      const [latest, publishers] = await Promise.all([
        fetchJsonFromIndex<PublicIndexLatest>(publicIndexUrl),
        fetchJsonFromIndex<PublicPublisherIndex>(
          publicIndexSiblingUrl(publicIndexUrl, "indexes/publishers.json"),
        ),
      ]);
      setPublicIndex(latest);
      setPublisherIndex(publishers);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadServerAdminState = async () => {
    setLoading(true);
    setError(null);
    try {
      const [users, reportResult, blocks, settings] = await Promise.all([
        invoke<UserPermissionListResponse>("fetch_server_user_permissions", {
          serverUrl: configuredArchiveHost(),
          bearerToken: adminToken.trim() || archiveActionToken(),
        }),
        invoke<ReportListResponse>("fetch_exchange_reports", {
          serverUrl: configuredArchiveHost(),
          bearerToken: adminToken.trim() || archiveActionToken(),
        }),
        invoke<ModerationBlocklistResponse>("fetch_moderation_blocklist", {
          serverUrl: configuredArchiveHost(),
          bearerToken: adminToken.trim() || archiveActionToken(),
        }),
        invoke<AdminServerSettings>("fetch_admin_server_settings", {
          serverUrl: configuredArchiveHost(),
          bearerToken: adminToken.trim() || archiveActionToken(),
        }),
      ]);
      setServerUsers(users.users || []);
      setReports(reportResult.reports || []);
      setBlocklist(blocks);
      setAdminServerSettings(settings);
      setServerUploadMode(
        settings.upload_mode === "public" ? "public" : "registered",
      );
      setServerRequireToken(Boolean(settings.require_upload_token));
      setServerPublicIndexEnabled(Boolean(settings.public_index_enabled));
      setServerIncludePrivate(Boolean(settings.public_index_include_private));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const saveAdminServerSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await invoke<AdminServerSettings>(
        "update_admin_server_settings",
        {
          serverUrl: configuredArchiveHost(),
          bearerToken: archiveActionToken(),
          uploadMode: serverUploadMode,
          requireUploadToken: serverRequireToken,
          publicIndexEnabled: serverPublicIndexEnabled,
          publicIndexIncludePrivate: serverIncludePrivate,
        },
      );
      setAdminServerSettings(settings);
      setServerUploadMode(
        settings.upload_mode === "public" ? "public" : "registered",
      );
      setServerRequireToken(Boolean(settings.require_upload_token));
      setServerPublicIndexEnabled(Boolean(settings.public_index_enabled));
      setServerIncludePrivate(Boolean(settings.public_index_include_private));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const updateUserAdminState = async (
    user: UserPermissionRecord,
    patch: Partial<
      Pick<
        UserPermissionRecord,
        | "can_connect"
        | "can_upload"
        | "is_admin"
        | "certificate_revoked"
        | "status"
      >
    >,
    note: string,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await invoke<UserPermissionRecord>(
        "update_server_user_permissions",
        {
          serverUrl: configuredArchiveHost(),
          bearerToken: archiveActionToken(),
          publisherId: user.publisher_id,
          canConnect: patch.can_connect ?? null,
          canUpload: patch.can_upload ?? null,
          isAdmin: patch.is_admin ?? null,
          certificateRevoked: patch.certificate_revoked ?? null,
          status: patch.status ?? null,
          note,
        },
      );
      setServerUsers((users) =>
        users.map((entry) =>
          entry.publisher_id === updated.publisher_id ? updated : entry,
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const addBlock = async () => {
    if (!selectedHash.trim()) {
      setError("Enter a package or layer BLAKE3 hash first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ModerationBlocklistResponse>(
        "add_moderation_block",
        {
          serverUrl: configuredArchiveHost(),
          bearerToken: archiveActionToken(),
          targetType: blockTargetType,
          hashBlake3: selectedHash.trim(),
          reason: blockReason.trim() || null,
          category: blockCategory.trim() || "policy",
          sourcePackageHash:
            blockTargetType === "file" ? null : selectedHash.trim(),
        },
      );
      setBlocklist(result);
      setSelectedHash("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const removePackage = async (pkg: PublicIndexPackageSummary) => {
    if (
      !window.confirm(
        `Remove ${pkg.title || pkg.original_filename} from the Exchange index?`,
      )
    )
      return;
    setLoading(true);
    setError(null);
    try {
      const removedHash = pkg.package_hash_blake3;
      await invoke<ReportRecord>("admin_remove_exchange_entry", {
        serverUrl: configuredArchiveHost(),
        bearerToken: archiveActionToken(),
        packageHashBlake3: removedHash,
        reason: "Removed from System Admin panel",
      });
      setPublicIndex((current) =>
        current
          ? {
              ...current,
              packages: current.packages.filter(
                (entry) => entry.package_hash_blake3 !== removedHash,
              ),
              package_count: Math.max(0, current.package_count - 1),
            }
          : current,
      );
      await loadGithubEnvironment();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const adminPageSize = 25;
  const allPackages = publicIndex?.packages || [];
  const filteredPackages = useMemo(() => {
    const q = packagesFilter.trim().toLowerCase();
    if (!q) return allPackages;
    return allPackages.filter((pkg) =>
      [
        pkg.title,
        pkg.original_filename,
        pkg.owner_display_name,
        pkg.owner_public_id,
        pkg.package_hash_blake3,
        ...(pkg.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [allPackages, packagesFilter]);
  const packageRows = filteredPackages.slice(
    packagesPage * adminPageSize,
    packagesPage * adminPageSize + adminPageSize,
  );
  const allUsers = serverUsers;
  const filteredUsers = useMemo(() => {
    const q = usersFilter.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter((user) =>
      [
        user.display_name,
        user.username,
        user.publisher_id,
        user.public_key,
        user.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [allUsers, usersFilter]);
  const userRows = filteredUsers.slice(
    usersPage * adminPageSize,
    usersPage * adminPageSize + adminPageSize,
  );
  const adminEvents = useMemo(() => {
    const userEvents = serverUsers.map((user) => ({
      id: `user-${user.publisher_id}`,
      type: "user",
      title: user.display_name || user.username || user.publisher_id,
      detail: `${user.status} · ${user.can_upload ? "upload allowed" : "upload blocked"} · ${user.is_admin ? "admin" : "publisher"}`,
      stamp: user.updated_at || "",
    }));
    const reportEvents = reports.map((report) => ({
      id: `report-${report.id}`,
      type: "report",
      title: report.package_title || shortHash(report.package_hash_blake3),
      detail: `${report.reason} · ${report.status} · reported by ${report.reporter_display_name}`,
      stamp: report.updated_at || report.created_at,
    }));
    const blockEvents = (blocklist?.entries || []).map((entry) => ({
      id: `block-${entry.target_type}-${entry.hash_blake3}`,
      type: "moderation",
      title: `${entry.target_type} block`,
      detail: `${entry.category} · ${entry.reason} · ${shortHash(entry.hash_blake3)}`,
      stamp: entry.created_at,
    }));
    return [...reportEvents, ...blockEvents, ...userEvents].sort((a, b) =>
      (b.stamp || "").localeCompare(a.stamp || ""),
    );
  }, [serverUsers, reports, blocklist]);
  const filteredEvents = useMemo(() => {
    const q = eventsFilter.trim().toLowerCase();
    if (!q) return adminEvents;
    return adminEvents.filter((event) =>
      [event.type, event.title, event.detail, event.stamp]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [adminEvents, eventsFilter]);
  const eventRows = filteredEvents.slice(
    eventsPage * adminPageSize,
    eventsPage * adminPageSize + adminPageSize,
  );

  useEffect(() => {
    setUsersPage(0);
  }, [usersFilter, serverUsers.length]);
  useEffect(() => {
    setEventsPage(0);
  }, [eventsFilter, adminEvents.length]);
  useEffect(() => {
    setPackagesPage(0);
  }, [packagesFilter, allPackages.length]);

  useEffect(() => {
    if (!adminToken.trim()) return;
    if (!publicIndex && !loading) void loadGithubEnvironment();
    if (
      serverUsers.length === 0 &&
      reports.length === 0 &&
      !blocklist &&
      !loading
    )
      void loadServerAdminState();
  }, [adminToken, sharedArchiveConnected]);

  const renderPager = (
    page: number,
    total: number,
    setPage: (next: number) => void,
  ) => {
    const pageCount = Math.max(1, Math.ceil(total / adminPageSize));
    return (
      <div className="admin-table-pager">
        <span>
          {Math.min(total, page * adminPageSize + 1)}-
          {Math.min(total, (page + 1) * adminPageSize)} of {total}
        </span>
        <GhostButton
          disabled={page <= 0}
          onClick={() => setPage(Math.max(0, page - 1))}
        >
          Previous
        </GhostButton>
        <GhostButton
          disabled={page >= pageCount - 1}
          onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
        >
          Next
        </GhostButton>
      </div>
    );
  };

  return (
    <div className="settings-screen integrated-settings admin-screen">
      {!adminToken.trim() && (
        <Panel>
          <div className="panel-title-row">
            <div>
              <div className="eyebrow">Admin token required</div>
              <h2>Save a token in Settings first</h2>
            </div>
            <span className="status-pill status-neutral">hidden</span>
          </div>
          <p>
            The admin panel is available after the admin/moderation token is
            stored in the System settings area.
          </p>
        </Panel>
      )}

      {adminToken.trim() && (
        <>
          <Panel>
            <div className="panel-title-row">
              <div>
                <div className="eyebrow">Environment</div>
                <h2>Public index overview</h2>
              </div>
              <span
                className={
                  publicIndex
                    ? "status-pill status-good"
                    : "status-pill status-neutral"
                }
              >
                {publicIndex
                  ? `index ${formatDate(publicIndex.generated_at)}`
                  : "not loaded"}
              </span>
            </div>
            <p>
              Loads automatically when the admin area opens. Public package
              metadata comes from the Git index; live server calls are used for
              events, users, reports, and moderation state.
            </p>
            <div className="hero-actions">
              <button
                type="button"
                className="refresh-icon-button"
                disabled={loading}
                onClick={() => {
                  void loadGithubEnvironment();
                  void loadServerAdminState();
                }}
                aria-label={
                  loading ? "Loading admin state" : "Refresh admin state"
                }
                title={loading ? "Loading admin state" : "Refresh admin state"}
              >
                ↻
              </button>
            </div>
            <ErrorBox error={error} />
            <div className="admin-metric-grid">
              <div className="metric-card">
                <span>Characters</span>
                <strong>{publicIndex?.package_count ?? "—"}</strong>
              </div>
              <div className="metric-card">
                <span>Publishers</span>
                <strong>{publisherIndex?.publisher_count ?? "—"}</strong>
              </div>
              <div className="metric-card">
                <span>Known files</span>
                <strong>{publicIndex ? totalFiles : "—"}</strong>
              </div>
              <div className="metric-card">
                <span>Total payload</span>
                <strong>{publicIndex ? formatBytes(totalBytes) : "—"}</strong>
              </div>
              <div className="metric-card">
                <span>Potential paid tags</span>
                <strong>{publicIndex ? paidLikeCount : "—"}</strong>
              </div>
              <div className="metric-card">
                <span>Blocked hashes</span>
                <strong>{blocklist ? blocklist.entries.length : "—"}</strong>
              </div>
            </div>
          </Panel>

          <Panel>
            <div className="panel-title-row">
              <div>
                <div className="eyebrow">Server settings</div>
                <h2>Upload and admin access</h2>
              </div>
              <span
                className={
                  adminServerSettings
                    ? "status-pill status-good"
                    : "status-pill status-neutral"
                }
              >
                {adminServerSettings ? "loaded" : "not loaded"}
              </span>
            </div>
            <p>
              Configure the small set of server-side controls that are safe to
              manage from the client. The token remains a break-glass admin path
              even when a user's certificate is revoked.
            </p>
            <div className="form-grid two-columns">
              <label>
                <span>Upload mode</span>
                <select
                  value={serverUploadMode}
                  onChange={(event) =>
                    setServerUploadMode(
                      event.target.value as "public" | "registered",
                    )
                  }
                >
                  <option value="registered">
                    Private: registered users with upload permission
                  </option>
                  <option value="public">
                    Public: allow uploads without registration
                  </option>
                </select>
              </label>
              <label>
                <span>Require legacy upload token</span>
                <select
                  value={serverRequireToken ? "true" : "false"}
                  onChange={(event) =>
                    setServerRequireToken(event.target.value === "true")
                  }
                >
                  <option value="false">No</option>
                  <option value="true">Yes, token required</option>
                </select>
              </label>
              <label>
                <span>Public index export enabled</span>
                <select
                  value={serverPublicIndexEnabled ? "true" : "false"}
                  onChange={(event) =>
                    setServerPublicIndexEnabled(event.target.value === "true")
                  }
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </label>
              <label>
                <span>Include non-public packages in public index</span>
                <select
                  value={serverIncludePrivate ? "true" : "false"}
                  onChange={(event) =>
                    setServerIncludePrivate(event.target.value === "true")
                  }
                >
                  <option value="false">No, public/listed only</option>
                  <option value="true">Yes, local test only</option>
                </select>
              </label>
            </div>
            <div className="hero-actions">
              <GhostButton
                disabled={loading || !adminToken.trim()}
                onClick={saveAdminServerSettings}
              >
                Save server settings
              </GhostButton>
              <GhostButton
                disabled={loading || !adminToken.trim()}
                onClick={loadServerAdminState}
              >
                Reload
              </GhostButton>
            </div>
            {adminServerSettings?.restart_required && (
              <SuccessBox>
                <strong>Restart may be required.</strong>
                <p>
                  Some process/config values are stored as admin intent and may
                  need a server restart or config reconciliation. Upload mode
                  applies immediately.
                </p>
              </SuccessBox>
            )}
          </Panel>

          <Panel>
            <div className="panel-title-row">
              <div>
                <div className="eyebrow">Public index</div>
                <h2>Index operations</h2>
              </div>
              <span
                className={
                  indexDiagnostics?.git_available
                    ? "status-pill status-good"
                    : "status-pill status-neutral"
                }
              >
                {indexDiagnostics?.git_version || "not checked"}
              </span>
            </div>
            <div className="hero-actions">
              <GhostButton disabled={loading} onClick={loadIndexDiagnostics}>
                Check index setup
              </GhostButton>
              <GhostButton disabled={loading} onClick={ensureIndexSshKey}>
                Show deploy key
              </GhostButton>
              <GhostButton disabled={loading} onClick={testIndexSshKey}>
                Test SSH access
              </GhostButton>
            </div>
            {indexDiagnostics && (
              <div className="source-list mt-2">
                <div className="source-row">
                  <div>
                    <strong>{indexDiagnostics.repo || "local index"}</strong>
                    <span>{indexDiagnostics.index_dir}</span>
                    <code>
                      branch {indexDiagnostics.branch} · packages{" "}
                      {indexDiagnostics.package_count} · files{" "}
                      {indexDiagnostics.file_metadata_count} · auth{" "}
                      {indexDiagnostics.auth_method}
                    </code>
                  </div>
                </div>
                {indexDiagnostics.checks.map((check) => (
                  <div key={check.name} className="source-row">
                    <div>
                      <strong>{check.name}</strong>
                      <span>{check.detail}</span>
                    </div>
                    <span
                      className={
                        check.ok
                          ? "status-pill status-good"
                          : "status-pill status-neutral"
                      }
                    >
                      {check.ok ? "ok" : "needs setup"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {indexSshKey && (
              <SuccessBox>
                <div className="font-semibold">
                  Index SSH key {indexSshKey.created ? "created" : "ready"}
                </div>
                <div className="path-block">{indexSshKey.private_key_file}</div>
                <div className="selectable-key">
                  {indexSshKey.public_key ||
                    "Public key file was not readable."}
                </div>
              </SuccessBox>
            )}
            {indexSshTest && (
              <div
                className={indexSshTest.ok ? "alert success" : "alert error"}
              >
                <div className="font-semibold">
                  SSH test {indexSshTest.ok ? "passed" : "failed"}
                </div>
                <div className="mt-1 font-mono text-xs">
                  {indexSshTest.remote}
                </div>
                {indexSshTest.stderr && (
                  <div className="mt-2 font-mono text-xs diagnostic-text">
                    {indexSshTest.stderr}
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel>
            <div className="panel-title-row">
              <div>
                <div className="eyebrow">Users</div>
                <h2>Registered users</h2>
              </div>
              <span className="status-pill status-neutral">
                {filteredUsers.length} users
              </span>
            </div>
            <div className="admin-table-toolbar">
              <Field
                value={usersFilter}
                onChange={(event) => setUsersFilter(event.target.value)}
                placeholder="Filter users by username, display name, public key, or status"
              />
            </div>
            <div className="admin-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Public key</th>
                    <th>Status</th>
                    <th>Permissions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {userRows.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        {error
                          ? "Could not load registered users. Check the token and server connection."
                          : "No registered users found yet."}
                      </td>
                    </tr>
                  )}
                  {userRows.map((user) => (
                    <tr key={user.publisher_id}>
                      <td>
                        <strong>
                          {user.display_name ||
                            user.username ||
                            user.publisher_id}
                        </strong>
                        <span>{user.username || "No username"}</span>
                      </td>
                      <td>
                        <code>
                          {user.public_key
                            ? shortHash(user.public_key)
                            : shortHash(user.publisher_id)}
                        </code>
                      </td>
                      <td>
                        <span
                          className={`status-pill ${user.certificate_revoked || user.status === "blocked" || user.status === "disabled" ? "status-warn" : "status-neutral"}`}
                        >
                          {user.certificate_revoked
                            ? "certificate revoked"
                            : user.status}
                        </span>
                      </td>
                      <td>
                        {user.is_admin ? "admin" : "publisher"} ·{" "}
                        {user.can_upload ? "upload" : "no upload"} ·{" "}
                        {user.can_connect ? "connect" : "no connect"}
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <GhostButton
                            disabled={loading}
                            onClick={() =>
                              updateUserAdminState(
                                user,
                                { is_admin: !user.is_admin },
                                user.is_admin
                                  ? "Admin role revoked from client admin panel"
                                  : "Admin role granted from client admin panel",
                              )
                            }
                          >
                            {user.is_admin ? "Revoke admin" : "Make admin"}
                          </GhostButton>
                          <GhostButton
                            disabled={loading}
                            onClick={() =>
                              updateUserAdminState(
                                user,
                                { can_upload: !user.can_upload },
                                user.can_upload
                                  ? "Upload permission revoked from client admin panel"
                                  : "Upload permission granted from client admin panel",
                              )
                            }
                          >
                            {user.can_upload ? "Revoke upload" : "Allow upload"}
                          </GhostButton>
                          <GhostButton
                            disabled={loading}
                            onClick={() =>
                              updateUserAdminState(
                                user,
                                {
                                  certificate_revoked:
                                    !user.certificate_revoked,
                                },
                                user.certificate_revoked
                                  ? "Certificate restored from client admin panel"
                                  : "Certificate revoked from client admin panel",
                              )
                            }
                          >
                            {user.certificate_revoked
                              ? "Restore cert"
                              : "Revoke cert"}
                          </GhostButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {renderPager(usersPage, filteredUsers.length, setUsersPage)}
          </Panel>

          <Panel>
            <div className="panel-title-row">
              <div>
                <div className="eyebrow">Moderation blocklist</div>
                <h2>Block packages or layers</h2>
              </div>
              <span
                className={
                  (blocklist?.entries.length || 0) > 0
                    ? "status-pill status-warn"
                    : "status-pill status-neutral"
                }
              >
                {blocklist
                  ? `${blocklist.package_block_count} packages · ${blocklist.file_block_count} layers`
                  : "not loaded"}
              </span>
            </div>
            <p>
              Use package blocks for a whole character upload. Use layer/file
              blocks for exact BLAKE3 payload hashes that are blocked from
              future publishing, including disputed paid mods, potentially
              illegal files, or content outside the community policy. Moderation
              blocks remain private administrative state.
            </p>
            <div className="form-grid admin-block-form">
              <select
                value={blockTargetType}
                onChange={(event) =>
                  setBlockTargetType(event.target.value as "package" | "file")
                }
              >
                <option value="package">Package / character hash</option>
                <option value="file">Layer / file payload hash</option>
              </select>
              <Field
                value={selectedHash}
                onChange={(event) => setSelectedHash(event.target.value)}
                placeholder="BLAKE3 hash"
              />
              <select
                value={blockCategory}
                onChange={(event) => setBlockCategory(event.target.value)}
              >
                <option value="copyright-or-paid-mod">
                  Copyright / paid mod dispute
                </option>
                <option value="potentially-illegal">
                  Potentially illegal / legally unsafe
                </option>
                <option value="sexualized-minor-or-age-ambiguous">
                  Sexualized minor or age-ambiguous content
                </option>
                <option value="malware-or-abuse">Malware or abuse</option>
                <option value="privacy-or-doxxing">Privacy or doxxing</option>
                <option value="policy">Other policy issue</option>
              </select>
              <Field
                value={blockReason}
                onChange={(event) => setBlockReason(event.target.value)}
                placeholder="Reason shown in admin records"
              />
            </div>
            <div className="hero-actions">
              <GhostButton disabled={loading} onClick={addBlock}>
                Add block
              </GhostButton>
              <button
                type="button"
                className="refresh-icon-button"
                disabled={loading}
                onClick={loadServerAdminState}
                aria-label={loading ? "Loading blocklist" : "Refresh blocklist"}
                title={loading ? "Loading blocklist" : "Refresh blocklist"}
              >
                ↻
              </button>
            </div>
            <div className="source-list moderation-list">
              {(blocklist?.entries || []).slice(0, 12).map((entry) => (
                <div
                  key={`${entry.target_type}-${entry.hash_blake3}`}
                  className="source-row moderation-row"
                >
                  <div>
                    <strong>
                      {entry.target_type} · {entry.category}
                    </strong>
                    <span>{entry.reason}</span>
                    <code>
                      {shortHash(entry.hash_blake3)} ·{" "}
                      {formatDate(entry.created_at)}
                    </code>
                  </div>
                  <span className="status-pill status-warn">blocked</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <div className="panel-title-row">
              <div>
                <div className="eyebrow">Characters</div>
                <h2>Published entries</h2>
              </div>
              <span className="status-pill status-neutral">
                {filteredPackages.length} entries
              </span>
            </div>
            <div className="admin-table-toolbar">
              <Field
                value={packagesFilter}
                onChange={(event) => setPackagesFilter(event.target.value)}
                placeholder="Filter characters by title, creator, tag, or hash"
              />
            </div>
            <div className="admin-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Character</th>
                    <th>Creator</th>
                    <th>Files</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {packageRows.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        Load the GitHub index to see published characters.
                      </td>
                    </tr>
                  )}
                  {packageRows.map((pkg) => (
                    <tr key={pkg.package_hash_blake3}>
                      <td>
                        <strong>{pkg.title || pkg.original_filename}</strong>
                        <span>
                          {shortHash(pkg.package_hash_blake3)} ·{" "}
                          {(pkg.tags || []).join(", ") || "no tags"}
                        </span>
                      </td>
                      <td>
                        {pkg.owner_display_name ||
                          shortHash(pkg.owner_public_id)}
                      </td>
                      <td>
                        {pkg.file_count} · {formatBytes(pkg.total_file_bytes)}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${pkg.visibility === "public" ? "status-good" : "status-neutral"}`}
                        >
                          {pkg.visibility || "public"}
                        </span>
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <GhostButton
                            disabled={loading}
                            onClick={() => removePackage(pkg)}
                          >
                            Remove
                          </GhostButton>
                          <GhostButton
                            disabled={loading}
                            onClick={() => {
                              setSelectedHash(pkg.package_hash_blake3);
                              setBlockTargetType("package");
                            }}
                          >
                            Prepare block
                          </GhostButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {renderPager(
              packagesPage,
              filteredPackages.length,
              setPackagesPage,
            )}
          </Panel>

          <Panel>
            <div className="panel-title-row">
              <div>
                <div className="eyebrow">Events</div>
                <h2>Server events</h2>
              </div>
              <span className="status-pill status-neutral">
                {filteredEvents.length} events
              </span>
            </div>
            <div className="admin-table-toolbar">
              <Field
                value={eventsFilter}
                onChange={(event) => setEventsFilter(event.target.value)}
                placeholder="Filter events by type, user, package, reason, or hash"
              />
            </div>
            <div className="admin-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Subject</th>
                    <th>Details</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {eventRows.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        Connect and load server state to see events.
                      </td>
                    </tr>
                  )}
                  {eventRows.map((event) => (
                    <tr key={event.id}>
                      <td>{event.stamp ? formatDate(event.stamp) : "—"}</td>
                      <td>
                        <span className="status-pill status-neutral">
                          {event.type}
                        </span>
                      </td>
                      <td>
                        <strong>{event.title}</strong>
                      </td>
                      <td>{event.detail}</td>
                      <td>
                        <div className="admin-row-actions">
                          <GhostButton disabled>Select</GhostButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {renderPager(eventsPage, filteredEvents.length, setEventsPage)}
          </Panel>
        </>
      )}
    </div>
  );
}

function PublishedIndexPanel({
  sharedArchiveConnected,
}: {
  sharedArchiveConnected: boolean;
}) {
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [publicIndex, setPublicIndex] = useState<PublicIndexLatest | null>(
    null,
  );
  const [selectedPublicPackage, setSelectedPublicPackage] =
    useState<PublicPackageRecord | null>(null);
  const [packageLoading, setPackageLoading] = useState(false);
  const [exchangeSearch, setExchangeSearch] = useState("");
  const [exchangeTagFilter, setExchangeTagFilter] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("");
  const [librarySettings, setLibrarySettings] = useState<LocalLibrarySettings>(
    () => readLibrarySettings(),
  );
  const [indexUrl] = useState(
    "https://raw.githubusercontent.com/obscure-crescent/moon-sparkles/main/public/indexes/latest.json",
  );
  const [exchangeFilter, setExchangeFilter] = useState<
    "all" | "favorites" | "recent" | "subscribed"
  >("all");
  const [favoriteHashes, setFavoriteHashes] = useState<string[]>(() =>
    JSON.parse(localStorage.getItem("mcdf.exchange.favorites.v1") || "[]"),
  );
  const [recentHashes, setRecentHashes] = useState<string[]>(() =>
    JSON.parse(localStorage.getItem("mcdf.exchange.recent.v1") || "[]"),
  );
  const [creatorSubscriptions, setCreatorSubscriptions] = useState<string[]>(
    () => readCreatorSubscriptions(),
  );
  const [packageSubscriptions, setPackageSubscriptions] = useState<string[]>(
    () => readPackageSubscriptions(),
  );
  const [downloadResult, setDownloadResult] =
    useState<ArchiveDownloadResult | null>(null);
  const [requestAccessResult, setRequestAccessResult] =
    useState<AccessRequestNotification | null>(null);
  const [reportResult, setReportResult] = useState<ReportRecord | null>(null);
  const [cacheInspection, setCacheInspection] =
    useState<ExchangePackageCacheInspection | null>(null);
  const [cacheActionResult, setCacheActionResult] =
    useState<CacheClearResult | null>(null);
  const [detailsPaneOpen, setDetailsPaneOpen] = useState(true);
  const toggleFavorite = (hash: string) => {
    const next = favoriteHashes.includes(hash)
      ? favoriteHashes.filter((item) => item !== hash)
      : [hash, ...favoriteHashes];
    setFavoriteHashes(next);
    localStorage.setItem("mcdf.exchange.favorites.v1", JSON.stringify(next));
  };
  const toggleCreatorSubscription = (creatorId: string) => {
    const next = creatorSubscriptions.includes(creatorId)
      ? creatorSubscriptions.filter((item) => item !== creatorId)
      : [creatorId, ...creatorSubscriptions];
    setCreatorSubscriptions(next);
    writeCreatorSubscriptions(next);
    window.dispatchEvent(new Event("mcdf-creator-subscriptions-changed"));
  };
  const togglePackageSubscription = (
    pkg: PublicIndexPackageSummary | PublicPackageRecord,
  ) => {
    const packageHash = pkg.package_hash_blake3;
    const alreadySubscribed = packageSubscriptions.includes(packageHash);
    const next = alreadySubscribed
      ? packageSubscriptions.filter((item) => item !== packageHash)
      : [packageHash, ...packageSubscriptions];
    if (alreadySubscribed) {
      removePackageSubscriptionSnapshot(packageHash);
    } else {
      rememberPackageSubscriptionSnapshot(pkg);
    }
    setPackageSubscriptions(next);
    writePackageSubscriptions(next);
    window.dispatchEvent(new Event("mcdf-creator-subscriptions-changed"));
  };
  const rememberRecent = (hash: string) => {
    const next = [hash, ...recentHashes.filter((item) => item !== hash)].slice(
      0,
      30,
    );
    setRecentHashes(next);
    localStorage.setItem("mcdf.exchange.recent.v1", JSON.stringify(next));
  };

  const loadIndex = async () => {
    setIndexLoading(true);
    setIndexError(null);
    try {
      setPublicIndex(
        await invoke<PublicIndexLatest>("fetch_public_marketplace_index", {
          indexUrl,
        }),
      );
    } catch (e) {
      setIndexError(String(e));
    } finally {
      setIndexLoading(false);
    }
  };

  useEffect(() => {
    loadIndex().catch(console.error);
  }, []);

  const inspectPackage = async (pkg: PublicIndexPackageSummary) => {
    rememberRecent(pkg.package_hash_blake3);
    setPackageLoading(true);
    setIndexError(null);
    setSelectedPublicPackage(null);
    try {
      setSelectedPublicPackage(
        await invoke<PublicPackageRecord>("fetch_public_package_record", {
          indexUrl,
          packageManifestPath: pkg.package_manifest_path,
        }),
      );
    } catch (e) {
      setIndexError(String(e));
    } finally {
      setPackageLoading(false);
    }
  };

  const downloadSelectedExchangePackage = async () => {
    if (!selectedPublicPackage) return;
    if (
      selectedPublicPackage.visibility === "locked" ||
      selectedPublicPackage.visibility === "private"
    ) {
      setIndexError("This entry requires access before downloading.");
      return;
    }
    const selected = await save({
      defaultPath: `${selectedPublicPackage.original_filename.replace(/\.mcdf$/i, "")}.rebuilt.mcdf`,
      filters: [{ name: "MCDF", extensions: ["mcdf"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    setPackageLoading(true);
    setIndexError(null);
    setDownloadResult(null);
    try {
      const summary = packages.find(
        (pkg) =>
          pkg.package_hash_blake3 === selectedPublicPackage.package_hash_blake3,
      );
      setDownloadResult(
        await invoke<ArchiveDownloadResult>(
          "download_package_from_exchange_index",
          {
            indexUrl,
            packageManifestPath:
              summary?.download_manifest_path ||
              summary?.package_manifest_path ||
              "",
            serverUrl: configuredArchiveHost(),
            outputPath: selected,
          },
        ),
      );
    } catch (e) {
      setIndexError(String(e));
    } finally {
      setPackageLoading(false);
    }
  };

  const inspectSelectedPackageCache = async () => {
    if (!selectedPublicPackage) return;
    const summary = packages.find(
      (pkg) =>
        pkg.package_hash_blake3 === selectedPublicPackage.package_hash_blake3,
    );
    if (!summary) return;
    setPackageLoading(true);
    setIndexError(null);
    setCacheActionResult(null);
    try {
      const result = await invoke<ExchangePackageCacheInspection>(
        "inspect_exchange_package_cache",
        {
          indexUrl,
          packageManifestPath: summary.package_manifest_path,
        },
      );
      setCacheInspection(result);
    } catch (e) {
      setIndexError(String(e));
    } finally {
      setPackageLoading(false);
    }
  };

  const clearSelectedPackageCache = async () => {
    if (!selectedPublicPackage) return;
    const summary = packages.find(
      (pkg) =>
        pkg.package_hash_blake3 === selectedPublicPackage.package_hash_blake3,
    );
    if (!summary) return;
    setPackageLoading(true);
    setIndexError(null);
    try {
      const result = await invoke<CacheClearResult>(
        "clear_exchange_package_cache",
        {
          indexUrl,
          packageManifestPath: summary.package_manifest_path,
        },
      );
      setCacheActionResult(result);
      await inspectSelectedPackageCache();
    } catch (e) {
      setIndexError(String(e));
    } finally {
      setPackageLoading(false);
    }
  };

  const requestAccessForSelectedPackage = async () => {
    if (!selectedPublicPackage) return;
    if (!sharedArchiveConnected) {
      setIndexError("Connect to the archive server before requesting access.");
      return;
    }
    const note = window.prompt(
      "Optional note to the creator",
      "Requesting access to this locked MCDF.",
    );
    if (note === null) return;
    setPackageLoading(true);
    setIndexError(null);
    setRequestAccessResult(null);
    try {
      const result = await invoke<AccessRequestNotification>(
        "request_locked_mcdf_access",
        {
          serverUrl: configuredArchiveHost(),
          bearerToken: archiveActionToken(),
          packageHashBlake3: selectedPublicPackage.package_hash_blake3,
          requesterDisplayName: storedPublisherDisplayName(),
          note,
        },
      );
      setRequestAccessResult(result);
    } catch (e) {
      setIndexError(String(e));
    } finally {
      setPackageLoading(false);
    }
  };

  const reportSelectedPackage = async () => {
    if (!selectedPublicPackage) return;
    if (!sharedArchiveConnected) {
      setIndexError("Connect to the archive server before reporting an entry.");
      return;
    }
    const category = window.prompt(
      "Report category: inaccessible, unsafe, duplicate, incorrect metadata, or other",
      "inaccessible",
    );
    if (category === null) return;
    const note = window.prompt("Optional extra context for the admin", "");
    setPackageLoading(true);
    setIndexError(null);
    setReportResult(null);
    try {
      const result = await invoke<ReportRecord>("report_exchange_entry", {
        serverUrl: configuredArchiveHost(),
        bearerToken: archiveActionToken(),
        packageHashBlake3: selectedPublicPackage.package_hash_blake3,
        reporterDisplayName: storedPublisherDisplayName(),
        reason: category.trim() || "other",
        note,
      });
      setReportResult(result);
    } catch (e) {
      setIndexError(String(e));
    } finally {
      setPackageLoading(false);
    }
  };

  const removeSelectedPackageAsAdmin = async () => {
    if (!selectedPublicPackage) return;
    if (!sharedArchiveConnected) {
      setIndexError(
        "Connect to the archive server before using admin removal.",
      );
      return;
    }
    if (
      !window.confirm(
        `Remove ${selectedPublicPackage.title || selectedPublicPackage.original_filename} from the server/index?`,
      )
    )
      return;
    setPackageLoading(true);
    setIndexError(null);
    try {
      const removedHash = selectedPublicPackage.package_hash_blake3;
      await invoke<ReportRecord>("admin_remove_exchange_entry", {
        serverUrl: configuredArchiveHost(),
        bearerToken: archiveActionToken(),
        packageHashBlake3: removedHash,
        reason: "Removed by admin from MCDF Manager",
      });
      setPublicIndex((current) =>
        current
          ? {
              ...current,
              packages: current.packages.filter(
                (pkg) => pkg.package_hash_blake3 !== removedHash,
              ),
              package_count: Math.max(0, current.package_count - 1),
            }
          : current,
      );
      setSelectedPublicPackage(null);
      await loadIndex();
    } catch (e) {
      setIndexError(String(e));
    } finally {
      setPackageLoading(false);
    }
  };

  const saveExchangeSettings = (patch: Partial<LocalLibrarySettings>) => {
    const next = { ...librarySettings, ...patch };
    setLibrarySettings(next);
    writeLibrarySettings(next);
  };

  const packages = publicIndex?.packages ?? [];
  const availableTags = Array.from(
    new Set(packages.flatMap((pkg) => pkg.tags || [])),
  ).sort();
  const availableCreators: Array<[string, string]> = Array.from(
    new Map<string, string>(
      packages.map((pkg) => [
        creatorKeyFromPackage(pkg),
        creatorLabelFromPackage(pkg),
      ]),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const visiblePackages = packages.filter((pkg) => {
    const haystack =
      `${pkg.title || ""} ${pkg.original_filename || ""} ${pkg.owner_display_name || ""} ${(pkg.tags || []).join(" ")} ${pkg.component_kinds.join(" ")}`.toLowerCase();
    const matchesSearch =
      !exchangeSearch.trim() ||
      haystack.includes(exchangeSearch.trim().toLowerCase());
    const adult = packageIsAdult(pkg);
    const adultVisible = librarySettings.adultContentMode === "show" || !adult;
    const creatorId = creatorKeyFromPackage(pkg);
    const matchesCreator = !creatorFilter || creatorId === creatorFilter;
    const matchesTag =
      !exchangeTagFilter || (pkg.tags || []).includes(exchangeTagFilter);
    const matchesShelf =
      exchangeFilter === "all" ||
      (exchangeFilter === "favorites" &&
        favoriteHashes.includes(pkg.package_hash_blake3)) ||
      (exchangeFilter === "recent" &&
        recentHashes.includes(pkg.package_hash_blake3)) ||
      (exchangeFilter === "subscribed" &&
        (creatorSubscriptions.includes(creatorId) ||
          packageSubscriptions.includes(pkg.package_hash_blake3)));
    return (
      matchesSearch &&
      matchesCreator &&
      matchesTag &&
      adultVisible &&
      matchesShelf
    );
  });
  const selectedCreator = creatorFilter
    ? availableCreators.find(([creatorId]) => creatorId === creatorFilter)
    : null;
  const creatorPackages = creatorFilter
    ? packages.filter((pkg) => creatorKeyFromPackage(pkg) === creatorFilter)
    : [];
  const creatorTagShelf = Array.from(
    new Set(creatorPackages.flatMap((pkg) => pkg.tags || [])),
  ).slice(0, 16);
  const unseenSubscribedCount = packages.filter(
    (pkg) =>
      (creatorSubscriptions.includes(creatorKeyFromPackage(pkg)) ||
        packageSubscriptions.includes(pkg.package_hash_blake3)) &&
      !recentHashes.includes(pkg.package_hash_blake3),
  ).length;
  const dateMode = librarySettings.dateDisplayMode;
  const closeExchangeDetailsWhenClickingOutside = (
    event: MouseEvent<HTMLDivElement>,
  ) => {
    if (!detailsPaneOpen) return;
    const target = event.target as HTMLElement;
    if (
      target.closest(".elevated-detail-pane") ||
      target.closest(".exchange-table-row") ||
      target.closest(".exchange-entry-card") ||
      target.closest(".modal-card")
    )
      return;
    setDetailsPaneOpen(false);
  };
  return (
    <div
      className={`screen-grid published-screen exchange-screen exchange-flat no-left-preview ${selectedPublicPackage ? "has-selection" : "no-selection"}`}
      onMouseDown={closeExchangeDetailsWhenClickingOutside}
    >
      <div className="main-stack exchange-main-flat">
        <div className="exchange-flat-toolbar">
          <div className="exchange-toolbar-title">
            <div className="eyebrow">Search the registry</div>
            <h1>The Eorzea Exchange</h1>
          </div>
          <div className="exchange-toolbar-actions">
            <button
              type="button"
              className="refresh-icon-button"
              disabled={indexLoading}
              onClick={loadIndex}
              aria-label={
                indexLoading ? "Loading registry" : "Refresh registry"
              }
              title={indexLoading ? "Loading registry" : "Refresh registry"}
            >
              ↻
            </button>
          </div>
          <div className="library-toolbar exchange-toolbar-row exchange-inline-filters">
            <Field
              value={exchangeSearch}
              onChange={(e) => setExchangeSearch(e.target.value)}
              placeholder="Search title, creator, tags, components…"
            />
            <select
              value={librarySettings.exchangeViewMode}
              onChange={(e) =>
                saveExchangeSettings({
                  exchangeViewMode: e.target.value as BrowserDisplayMode,
                })
              }
            >
              <option value="list">List view</option>
              <option value="cards">Large cards</option>
            </select>
            <select
              value={exchangeFilter}
              onChange={(e) =>
                setExchangeFilter(e.target.value as typeof exchangeFilter)
              }
            >
              <option value="all">All</option>
              <option value="favorites">★ Favorites</option>
              <option value="recent">Recently viewed</option>
              <option value="subscribed">Subscribed creators</option>
            </select>
            <select
              value={creatorFilter}
              onChange={(e) => setCreatorFilter(e.target.value)}
            >
              <option value="">All creators</option>
              {availableCreators.map(([creatorId, label]) => (
                <option key={creatorId} value={creatorId}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={exchangeTagFilter}
              onChange={(e) => setExchangeTagFilter(e.target.value)}
            >
              <option value="">All tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        </div>
        <ErrorBox error={indexError} />
        {selectedCreator && (
          <div className="exchange-inline-section creator-profile-line">
            <div>
              <div className="eyebrow">Creator</div>
              <h2>{selectedCreator[1]}</h2>
              <p>
                {creatorPackages.length} public entries. Subscriptions are
                stored locally and synced for registered profiles when profile
                sync is enabled.
              </p>
              {creatorTagShelf.length > 0 && (
                <div className="tag-row compact-tags">
                  {creatorTagShelf.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="inline-actions">
              <GhostButton
                className="flat-action"
                title={
                  creatorSubscriptions.includes(selectedCreator[0])
                    ? "Remove this local creator subscription"
                    : "Follow this creator locally"
                }
                onClick={() => toggleCreatorSubscription(selectedCreator[0])}
              >
                {creatorSubscriptions.includes(selectedCreator[0])
                  ? "Subscribed"
                  : "Subscribe"}
              </GhostButton>
              <GhostButton
                className="flat-action"
                onClick={() => setCreatorFilter("")}
              >
                All creators
              </GhostButton>
            </div>
          </div>
        )}
        {exchangeFilter === "subscribed" && unseenSubscribedCount > 0 && (
          <div className="exchange-inline-section subscription-line">
            <strong>
              {unseenSubscribedCount} subscribed Exchange entries not recently
              viewed
            </strong>
            <span>Open Details on an entry to mark it as recently viewed.</span>
          </div>
        )}
        {publicIndex && (
          <div className="exchange-results-section">
            <div className="exchange-results-header">
              <div>
                <div className="eyebrow">Entries</div>
                <h2>
                  {visiblePackages.length} shown · {publicIndex.package_count}{" "}
                  indexed
                </h2>
              </div>
              <span className="flat-status status-good">
                Date {formatDate(publicIndex.generated_at, dateMode)}
              </span>
            </div>
            {packages.length === 0 ? (
              <p className="empty-small">
                The index is loaded, but it does not list packages yet.
              </p>
            ) : visiblePackages.length === 0 ? (
              <p className="empty-small">
                No Exchange entries match this search/filter.
              </p>
            ) : librarySettings.exchangeViewMode === "list" ? (
              <div
                className="library-table exchange-table"
                role="table"
                aria-label="The Eorzea Exchange entries"
              >
                <div
                  className="library-table-header exchange-table-header"
                  role="row"
                >
                  <span>Name</span>
                  <span>Creator</span>
                  <span>Files</span>
                  <span>Size</span>
                  <span>Updated</span>
                  <span>Favorite</span>
                  <span>Labels</span>
                  <span>Actions</span>
                </div>
                {visiblePackages.map((pkg) => {
                  const creatorId = creatorKeyFromPackage(pkg);
                  const isFavorite = favoriteHashes.includes(
                    pkg.package_hash_blake3,
                  );
                  const isSubscribed = creatorSubscriptions.includes(creatorId);
                  const labelText =
                    exchangePackageTags(pkg)
                      .slice(0, 2)
                      .map((tag) => `#${tag}`)
                      .concat(exchangePackageLabels(pkg).slice(0, 3))
                      .join(" · ") || "—";
                  return (
                    <div
                      key={pkg.package_hash_blake3}
                      className="library-table-row exchange-table-row"
                      role="row"
                    >
                      <button
                        type="button"
                        className="exchange-table-title"
                        onClick={() => inspectPackage(pkg)}
                        disabled={packageLoading}
                      >
                        <span className="table-title">
                          {pkg.title ||
                            pkg.original_filename ||
                            "Untitled MCDF"}
                        </span>
                        {packageIsAdult(pkg) && (
                          <span className="mini-warning">18+</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="exchange-table-link"
                        onClick={() => setCreatorFilter(creatorId)}
                      >
                        {pkg.owner_display_name || "Unknown"}
                      </button>
                      <span>{pkg.file_count}</span>
                      <span>{formatBytes(pkg.total_file_bytes)}</span>
                      <span>
                        {formatDate(
                          pkg.updated_at || publicIndex.generated_at,
                          dateMode,
                        )}
                      </span>
                      <span
                        className={`table-tick ${isFavorite ? "yes" : "no"}`}
                      >
                        {isFavorite ? "★" : "—"}
                      </span>
                      <span className="table-tags">{labelText}</span>
                      <span className="exchange-table-actions">
                        <button
                          type="button"
                          className={`exchange-icon-action ${isFavorite ? "active" : ""}`}
                          title={isFavorite ? "Remove favorite" : "Favorite"}
                          aria-label={
                            isFavorite ? "Remove favorite" : "Favorite"
                          }
                          onClick={() =>
                            toggleFavorite(pkg.package_hash_blake3)
                          }
                        >
                          {isFavorite ? "★" : "☆"}
                        </button>
                        <button
                          type="button"
                          className={`exchange-icon-action ${isSubscribed ? "active" : ""}`}
                          title={
                            isSubscribed
                              ? "Unsubscribe from creator"
                              : "Subscribe to creator locally"
                          }
                          aria-label={
                            isSubscribed
                              ? "Unsubscribe from creator"
                              : "Subscribe to creator"
                          }
                          onClick={() => toggleCreatorSubscription(creatorId)}
                        >
                          {isSubscribed ? "✓" : "+"}
                        </button>
                        <GhostButton
                          className="flat-action"
                          disabled={packageLoading}
                          onClick={() => inspectPackage(pkg)}
                        >
                          Details
                        </GhostButton>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="browse-results card-grid exchange-card-grid">
                {visiblePackages.map((pkg) => {
                  const creatorId = creatorKeyFromPackage(pkg);
                  const isFavorite = favoriteHashes.includes(
                    pkg.package_hash_blake3,
                  );
                  const isSubscribed = creatorSubscriptions.includes(creatorId);
                  return (
                    <div
                      key={pkg.package_hash_blake3}
                      className="library-card exchange-entry-card"
                    >
                      <button
                        type="button"
                        className="library-row-main exchange-card-main"
                        onClick={() => inspectPackage(pkg)}
                        disabled={packageLoading}
                      >
                        <PreviewTile
                          image={publicIndexAssetUrl(
                            indexUrl,
                            pkg.preview_image_path,
                          )}
                          title={
                            pkg.title ||
                            pkg.original_filename ||
                            "Untitled MCDF"
                          }
                          adult={packageIsAdult(pkg)}
                        />
                        <strong>
                          {pkg.title ||
                            pkg.original_filename ||
                            "Untitled MCDF"}
                        </strong>
                        <span>
                          {pkg.owner_display_name || "unknown creator"} ·{" "}
                          {pkg.file_count} files ·{" "}
                          {formatBytes(pkg.total_file_bytes)}
                        </span>
                        <div className="tag-row compact-tags label-row">
                          {exchangePackageTags(pkg)
                            .slice(0, 3)
                            .map((tag) => (
                              <span key={`tag-${tag}`}>#{tag}</span>
                            ))}
                          {exchangePackageLabels(pkg)
                            .slice(0, 4)
                            .map((label) => (
                              <span key={`label-${label}`}>{label}</span>
                            ))}
                        </div>
                      </button>
                      <div className="state-pill-stack exchange-card-pills">
                        <span className="status-pill status-neutral">
                          Updated{" "}
                          {formatDate(
                            pkg.updated_at || publicIndex.generated_at,
                            dateMode,
                          )}
                        </span>
                        {isFavorite && (
                          <span className="status-pill status-good">
                            favorite
                          </span>
                        )}
                        {isSubscribed && (
                          <span className="status-pill status-good">
                            creator followed
                          </span>
                        )}
                      </div>
                      <div className="exchange-entry-actions">
                        <button
                          type="button"
                          className={`exchange-icon-action ${isFavorite ? "active" : ""}`}
                          title={isFavorite ? "Remove favorite" : "Favorite"}
                          aria-label={
                            isFavorite ? "Remove favorite" : "Favorite"
                          }
                          onClick={() =>
                            toggleFavorite(pkg.package_hash_blake3)
                          }
                        >
                          {isFavorite ? "★" : "☆"}
                        </button>
                        <button
                          type="button"
                          className={`exchange-icon-action ${isSubscribed ? "active" : ""}`}
                          title={
                            isSubscribed
                              ? "Unsubscribe from creator"
                              : "Subscribe to creator locally"
                          }
                          aria-label={
                            isSubscribed
                              ? "Unsubscribe from creator"
                              : "Subscribe to creator"
                          }
                          onClick={() => toggleCreatorSubscription(creatorId)}
                        >
                          {isSubscribed ? "✓" : "+"}
                        </button>
                        <GhostButton
                          className="flat-action"
                          onClick={() => setCreatorFilter(creatorId)}
                        >
                          {pkg.owner_display_name || "Creator"}
                        </GhostButton>
                        <GhostButton
                          className="flat-action"
                          disabled={packageLoading}
                          onClick={() => inspectPackage(pkg)}
                        >
                          Details
                        </GhostButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      {selectedPublicPackage && detailsPaneOpen && (
        <aside className="right-stack elevated-detail-pane exchange-detail-pane">
          <Panel>
            <div className="panel-title-row detail-title-row">
              <div>
                <div className="eyebrow">Selected entry</div>
                <h2>
                  {selectedPublicPackage.title ||
                    selectedPublicPackage.original_filename}
                </h2>
              </div>
              <div className="detail-title-actions">
                <span className="status-pill status-neutral">
                  {selectedPublicPackage.file_count} files
                </span>
                <IconButton
                  label="Close details"
                  className="detail-close-button"
                  onClick={() => setDetailsPaneOpen(false)}
                >
                  ×
                </IconButton>
              </div>
            </div>
            <div className="published-detail">
              {selectedPublicPackage.preview_image_path && (
                <img
                  className="package-preview-inline detail-hero-preview"
                  src={
                    publicIndexAssetUrl(
                      indexUrl,
                      selectedPublicPackage.preview_image_path,
                    ) || undefined
                  }
                  alt={
                    selectedPublicPackage.title ||
                    selectedPublicPackage.original_filename
                  }
                />
              )}
              <div className="summary-metrics">
                <div>
                  <strong>{selectedPublicPackage.file_count}</strong>
                  <span>files</span>
                </div>
                <div>
                  <strong>
                    {formatBytes(selectedPublicPackage.total_file_bytes)}
                  </strong>
                  <span>payload</span>
                </div>
                <div>
                  <strong>
                    {selectedPublicPackage.validation
                      ?.file_payloads_hash_verified
                      ? "verified"
                      : "pending"}
                  </strong>
                  <span>hashes</span>
                </div>
              </div>
              <div className="creator-profile-mini">
                <div>
                  <span className="eyebrow">Creator</span>
                  <strong>
                    {selectedPublicPackage.owner?.display_name ||
                      "Unknown creator"}
                  </strong>
                </div>
                <span className="status-pill status-neutral">
                  {
                    packages.filter(
                      (pkg) =>
                        creatorKeyFromPackage(pkg) ===
                        String(
                          selectedPublicPackage.owner?.public_id ||
                            selectedPublicPackage.owner?.display_name ||
                            "unknown",
                        ),
                    ).length
                  }{" "}
                  entries
                </span>
              </div>
              <p>
                {selectedPublicPackage.description ||
                  "No description was published for this package."}
              </p>
              {exchangePackageTags(selectedPublicPackage).length > 0 && (
                <div className="tag-group">
                  <span className="tag-group-title">Creator tags</span>
                  <div className="tag-row">
                    {exchangePackageTags(selectedPublicPackage).map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                </div>
              )}
              {exchangePackageLabels(selectedPublicPackage).length > 0 && (
                <div className="tag-group">
                  <span className="tag-group-title">Package labels</span>
                  <div className="tag-row label-row">
                    {exchangePackageLabels(selectedPublicPackage).map(
                      (label) => (
                        <span key={label}>{label}</span>
                      ),
                    )}
                  </div>
                </div>
              )}
              <div className="exchange-entry-controls">
                <PrimaryButton
                  disabled={
                    packageLoading ||
                    selectedPublicPackage.visibility === "locked" ||
                    selectedPublicPackage.visibility === "private"
                  }
                  title={
                    selectedPublicPackage.visibility === "locked" ||
                    selectedPublicPackage.visibility === "private"
                      ? "Access is required before downloading this entry."
                      : undefined
                  }
                  onClick={downloadSelectedExchangePackage}
                >
                  {packageLoading
                    ? "Working…"
                    : selectedPublicPackage.visibility === "locked" ||
                        selectedPublicPackage.visibility === "private"
                      ? "Access required"
                      : "Download MCDF"}
                </PrimaryButton>
                {selectedPublicPackage.visibility === "locked" && (
                  <GhostButton
                    disabled={!sharedArchiveConnected || packageLoading}
                    title={
                      serviceLockedMessage(sharedArchiveConnected) || undefined
                    }
                    onClick={requestAccessForSelectedPackage}
                  >
                    Request access
                  </GhostButton>
                )}
                {!creatorSubscriptions.includes(
                  creatorKeyFromPackage(selectedPublicPackage),
                ) && (
                  <GhostButton
                    onClick={() =>
                      togglePackageSubscription(selectedPublicPackage)
                    }
                  >
                    {packageSubscriptions.includes(
                      selectedPublicPackage.package_hash_blake3,
                    )
                      ? "In My Library"
                      : "Add to My Library"}
                  </GhostButton>
                )}
                <GhostButton
                  title="Follow this creator locally. When this is enabled, individual Add to My Library is hidden because the creator subscription already brings their online MCDFs into My Library."
                  onClick={() =>
                    toggleCreatorSubscription(
                      creatorKeyFromPackage(selectedPublicPackage),
                    )
                  }
                >
                  {creatorSubscriptions.includes(
                    creatorKeyFromPackage(selectedPublicPackage),
                  )
                    ? "Creator subscribed"
                    : "Subscribe creator"}
                </GhostButton>
                <GhostButton
                  onClick={() =>
                    toggleFavorite(selectedPublicPackage.package_hash_blake3)
                  }
                >
                  {favoriteHashes.includes(
                    selectedPublicPackage.package_hash_blake3,
                  )
                    ? "★ Favorite"
                    : "☆ Favorite"}
                </GhostButton>
                <GhostButton
                  disabled={!sharedArchiveConnected || packageLoading}
                  title={
                    serviceLockedMessage(sharedArchiveConnected) || undefined
                  }
                  onClick={reportSelectedPackage}
                >
                  Report
                </GhostButton>
                {storedAdminToken().trim() && (
                  <GhostButton
                    disabled={!sharedArchiveConnected || packageLoading}
                    title={
                      serviceLockedMessage(sharedArchiveConnected) || undefined
                    }
                    onClick={removeSelectedPackageAsAdmin}
                  >
                    Admin remove
                  </GhostButton>
                )}
                <GhostButton
                  disabled={packageLoading}
                  onClick={inspectSelectedPackageCache}
                >
                  Cache
                </GhostButton>
                {cacheInspection && cacheInspection.cached_count > 0 && (
                  <GhostButton
                    disabled={packageLoading}
                    onClick={clearSelectedPackageCache}
                  >
                    Clear cached parts
                  </GhostButton>
                )}
              </div>
              {requestAccessResult && (
                <SuccessBox>
                  <div className="font-semibold">Access request sent</div>
                  <div className="mt-2">
                    Status: {requestAccessResult.status}
                  </div>
                  <div className="mt-1 font-mono text-xs">
                    {requestAccessResult.id}
                  </div>
                </SuccessBox>
              )}
              {reportResult && (
                <SuccessBox>
                  <div className="font-semibold">Report sent for review</div>
                  <div className="mt-2">Status: {reportResult.status}</div>
                  <div className="mt-1 font-mono text-xs">
                    {reportResult.id}
                  </div>
                </SuccessBox>
              )}
              {downloadResult && (
                <SuccessBox>
                  <div>Downloaded rebuilt MCDF to:</div>
                  <div className="path-block">{downloadResult.output_path}</div>
                </SuccessBox>
              )}
              {cacheInspection && (
                <div className="alert success">
                  <div className="font-semibold">Local cache</div>
                  <div className="summary-metrics mt-2">
                    <div>
                      <strong>{cacheInspection.cached_count}</strong>
                      <span>cached</span>
                    </div>
                    <div>
                      <strong>{cacheInspection.missing_count}</strong>
                      <span>missing</span>
                    </div>
                    <div>
                      <strong>{cacheInspection.gap_percent.toFixed(0)}%</strong>
                      <span>registry gap</span>
                    </div>
                  </div>
                  <p className="empty-small">
                    {formatBytes(cacheInspection.cached_bytes)} cached out of{" "}
                    {formatBytes(cacheInspection.total_bytes)}.
                  </p>
                </div>
              )}
              {cacheActionResult && (
                <SuccessBox>
                  <div className="font-semibold">Cache updated</div>
                  {cacheActionResult.notes.map((note, index) => (
                    <p key={index} className="empty-small">
                      {note}
                    </p>
                  ))}
                </SuccessBox>
              )}
              <details className="advanced-identity-details">
                <summary>Advanced package identity</summary>
                <div className="path-block">
                  {selectedPublicPackage.package_hash_blake3}
                </div>
              </details>
              <div className="component-grid mt-2">
                {selectedPublicPackage.files.slice(0, 8).map((file, index) => (
                  <div
                    key={`${file.payload_blake3 ?? index}`}
                    className="component-card"
                  >
                    <div className="component-icon">
                      {(file.component_kind || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="component-name">
                        {file.display_name ||
                          file.game_paths?.[0] ||
                          "component"}
                      </div>
                      <div className="component-meta">
                        {file.component_kind || "component"} ·{" "}
                        {formatBytes(file.length)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </aside>
      )}
    </div>
  );
}

function AccessNotificationModal({
  requests,
  connected,
  loading,
  error,
  onRefresh,
  onReview,
  onClose,
}: {
  requests: AccessRequestNotification[];
  connected: boolean;
  loading?: boolean;
  error?: string | null;
  onRefresh: () => void;
  onReview: (id: string, status: "approved" | "denied") => void;
  onClose: () => void;
}) {
  const pending = requests.filter((request) => request.status === "pending");
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card notification-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-title-row">
          <div>
            <div className="eyebrow">Notifications</div>
            <h2>Requests</h2>
          </div>
          <div className="hero-actions icon-only-actions">
            <button
              type="button"
              className="refresh-icon-button"
              disabled={!connected || loading}
              onClick={onRefresh}
              aria-label={
                loading ? "Checking access requests" : "Refresh access requests"
              }
              title={
                !connected
                  ? "Connect to refresh access requests"
                  : loading
                    ? "Checking access requests"
                    : "Refresh access requests"
              }
            >
              ↻
            </button>
            <button
              type="button"
              className="modal-icon-close"
              onClick={onClose}
              aria-label="Close notifications"
              title="Close"
            >
              ×
            </button>
          </div>
        </div>
        {error && <ErrorBox error={error} />}
        {!connected && (
          <p className="empty-small">
            Connect to the server to check access requests.
          </p>
        )}
        {connected && pending.length === 0 && (
          <p className="empty-small">No pending access requests.</p>
        )}
        {pending.length > 0 && (
          <div className="source-list">
            {pending.map((request) => (
              <div key={request.id} className="source-row">
                <div>
                  <strong>{request.requester_display_name}</strong>
                  <span>
                    {request.package_title ||
                      request.package_hash_blake3 ||
                      "Locked MCDF"}
                  </span>
                  <code>{request.note || "Request pending owner review"}</code>
                </div>
                <div className="state-pill-stack">
                  <span className="status-pill status-warn">pending</span>
                  <GhostButton
                    disabled={loading}
                    onClick={() => onReview(request.id, "approved")}
                  >
                    Approve
                  </GhostButton>
                  <GhostButton
                    disabled={loading}
                    onClick={() => onReview(request.id, "denied")}
                  >
                    Deny
                  </GhostButton>
                </div>
              </div>
            ))}
          </div>
        )}
        {requests.some((request) => request.status !== "pending") && (
          <details className="mt-2">
            <summary>Reviewed requests</summary>
            <div className="source-list mt-2">
              {requests
                .filter((request) => request.status !== "pending")
                .map((request) => (
                  <div key={request.id} className="source-row">
                    <div>
                      <strong>{request.requester_display_name}</strong>
                      <span>
                        {request.package_title || request.package_hash_blake3}
                      </span>
                    </div>
                    <span
                      className={`status-pill ${request.status === "approved" ? "status-good" : "status-bad"}`}
                    >
                      {request.status}
                    </span>
                  </div>
                ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function BellButton({
  requests,
  onClick,
}: {
  requests: AccessRequestNotification[];
  onClick: () => void;
}) {
  const pending = requests.filter(
    (request) => request.status === "pending",
  ).length;
  return (
    <button
      type="button"
      className="bell-button"
      title="Access requests"
      aria-label="Access requests"
      onClick={onClick}
    >
      <span>🔔</span>
      {pending > 0 && <strong>{pending}</strong>}
    </button>
  );
}

function WindowControls() {
  const runWindowCommand = async (
    event: MouseEvent<HTMLButtonElement>,
    command: "window_minimize" | "window_toggle_maximize" | "window_close",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const appWindow = getCurrentWindow();
    try {
      if (command === "window_minimize") await appWindow.minimize();
      else if (command === "window_toggle_maximize")
        await appWindow.toggleMaximize();
      else await appWindow.close();
    } catch (error) {
      invoke(command).catch(console.error);
    }
  };
  return (
    <div className="window-controls" aria-label="Window controls">
      <button
        type="button"
        className="window-control"
        aria-label="Minimize"
        title="Minimize"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => runWindowCommand(event, "window_minimize")}
      >
        <span className="window-glyph window-glyph-minimize" />
      </button>
      <button
        type="button"
        className="window-control"
        aria-label="Maximize or restore"
        title="Maximize / restore"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => runWindowCommand(event, "window_toggle_maximize")}
      >
        <span className="window-glyph window-glyph-maximize" />
      </button>
      <button
        type="button"
        className="window-control window-control-close"
        aria-label="Close"
        title="Close"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => runWindowCommand(event, "window_close")}
      >
        <span className="window-glyph window-glyph-close" />
      </button>
    </div>
  );
}

function App() {
  const [clientAuthReady, setClientAuthReady] = useState(hasStoredClientAuth);
  const [sharedArchiveConnected, setSharedArchiveConnected] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [globalAddEntryOpen, setGlobalAddEntryOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [accessRequests, setAccessRequests] = useState<
    AccessRequestNotification[]
  >(() => readAccessNotifications());
  const [accessRequestsLoading, setAccessRequestsLoading] = useState(false);
  const [accessRequestsError, setAccessRequestsError] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<Tab>("library");
  const [analyzeOpenSignal, setAnalyzeOpenSignal] = useState(0);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [storageSetupOpen, setStorageSetupOpen] = useState(false);
  const [eulaOpen, setEulaOpen] = useState(!hasAcceptedEula());
  const [adminTokenConfigured, setAdminTokenConfigured] = useState(() =>
    Boolean(storedAdminToken().trim()),
  );

  useEffect(() => {
    let cancelled = false;
    invoke<StorageSettingsResponse>("get_storage_settings")
      .then((settings) => {
        if (!cancelled && !settings.initialized && !storageSetupAcknowledged())
          setStorageSetupOpen(true);
      })
      .catch(() => {
        if (!cancelled && !storageSetupAcknowledged())
          setStorageSetupOpen(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const refreshClientAuth = () => setClientAuthReady(hasStoredClientAuth());
    window.addEventListener("mcdf-client-auth-changed", refreshClientAuth);
    window.addEventListener("storage", refreshClientAuth);
    refreshClientAuth();
    return () => {
      window.removeEventListener("mcdf-client-auth-changed", refreshClientAuth);
      window.removeEventListener("storage", refreshClientAuth);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!clientAuthReady) {
      setSharedArchiveConnected(false);
      return;
    }
    invoke<CentralServerHealth>("central_server_health", {
      serverUrl: configuredArchiveHost(),
    })
      .then(() => {
        if (!cancelled) setSharedArchiveConnected(true);
      })
      .catch(() => {
        if (!cancelled) setSharedArchiveConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientAuthReady]);
  const refreshAccessRequests = async () => {
    if (!sharedArchiveConnected) {
      setAccessRequests(readAccessNotifications());
      return;
    }
    setAccessRequestsLoading(true);
    setAccessRequestsError(null);
    try {
      const response = await invoke<AccessRequestListResponse>(
        "fetch_access_requests",
        {
          serverUrl: configuredArchiveHost(),
          bearerToken: archiveActionToken(),
        },
      );
      setAccessRequests(response.requests);
      writeAccessNotifications(response.requests);
    } catch (error) {
      setAccessRequestsError(String(error));
      const cached = readAccessNotifications();
      setAccessRequests(cached);
    } finally {
      setAccessRequestsLoading(false);
    }
  };
  const reviewAccessRequest = async (
    requestId: string,
    status: "approved" | "denied",
  ) => {
    setAccessRequestsLoading(true);
    setAccessRequestsError(null);
    try {
      await invoke<AccessRequestNotification>("review_access_request", {
        serverUrl: configuredArchiveHost(),
        bearerToken: archiveActionToken(),
        requestId,
        status,
        decisionNote: null,
      });
      await refreshAccessRequests();
    } catch (error) {
      setAccessRequestsError(String(error));
      setAccessRequestsLoading(false);
    }
  };
  useEffect(() => {
    refreshAccessRequests();
    if (!sharedArchiveConnected) return;
    const timer = window.setInterval(refreshAccessRequests, 30000);
    return () => window.clearInterval(timer);
  }, [sharedArchiveConnected]);

  const addOperation = (op: Omit<Operation, "id" | "startedAt" | "status">) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setOperations((current) => [
      { ...op, id, startedAt: Date.now(), status: "running" },
      ...current,
    ]);
    return id;
  };
  const updateOperation = (id: string, patch: Partial<Operation>) => {
    setOperations((current) =>
      current.map((op) => (op.id === id ? { ...op, ...patch } : op)),
    );
  };
  const finishOperation = (id: string, patch: Partial<Operation>) => {
    setOperations((current) =>
      current.map((op) =>
        op.id === id ? { ...op, ...patch, endedAt: Date.now() } : op,
      ),
    );
  };
  const panelProps = useMemo(
    () => ({ addOperation, updateOperation, finishOperation }),
    [],
  );
  const visibleNavSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) => item.id !== "admin" || adminTokenConfigured,
          ),
        }))
        .filter((section) => section.items.length > 0),
    [adminTokenConfigured],
  );
  const activeLabel =
    visibleNavSections
      .flatMap((section) => section.items)
      .find((item) => item.id === activeTab)?.label ?? "MCDF Manager";
  const openConnectModal = () => {
    setConnectModalOpen(true);
  };
  const openAddEntryModal = () => {
    setGlobalAddEntryOpen(true);
  };
  const handleConnected = () => {
    setSharedArchiveConnected(true);
    setConnectModalOpen(false);
    setClientAuthReady(hasStoredClientAuth());
  };
  const handleDisconnect = () => {
    setSharedArchiveConnected(false);
  };
  useEffect(() => {
    const refreshAdminVisibility = () =>
      setAdminTokenConfigured(Boolean(storedAdminToken().trim()));
    window.addEventListener("mcdf-admin-token-changed", refreshAdminVisibility);
    window.addEventListener("storage", refreshAdminVisibility);
    loadAdminTokenFromConfig()
      .then((token) => setAdminTokenConfigured(Boolean(token.trim())))
      .catch(refreshAdminVisibility);
    return () => {
      window.removeEventListener(
        "mcdf-admin-token-changed",
        refreshAdminVisibility,
      );
      window.removeEventListener("storage", refreshAdminVisibility);
    };
  }, []);
  useEffect(() => {
    if (!adminTokenConfigured && activeTab === "admin")
      setActiveTab("settings");
  }, [adminTokenConfigured, activeTab]);
  const startWindowDrag = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "button,input,select,textarea,a,summary,details,.topbar-actions,.window-controls,.modal-backdrop",
      )
    )
      return;
    event.preventDefault();
    const appWindow = getCurrentWindow() as unknown as {
      startDragging?: () => Promise<void>;
    };
    appWindow.startDragging?.().catch(console.error);
  };
  const handleNavClick = (itemId: Tab) => {
    setActiveTab(itemId);
    if (itemId === "prepare") setAnalyzeOpenSignal((current) => current + 1);
  };
  return (
    <div
      className="app-shell"
      onContextMenu={(event) => event.preventDefault()}
    >
      {eulaOpen && (
        <EndUserLicenseAgreementModal onAccept={() => setEulaOpen(false)} />
      )}
      {storageSetupOpen && !eulaOpen && (
        <FirstBootStorageModal onDone={() => setStorageSetupOpen(false)} />
      )}
      {connectModalOpen && (
        <SharedArchiveConnectModal
          onClose={() => setConnectModalOpen(false)}
          onConnected={handleConnected}
        />
      )}
      {globalAddEntryOpen && (
        <AddMcdfEntryModal
          open={globalAddEntryOpen}
          onClose={() => setGlobalAddEntryOpen(false)}
          {...panelProps}
        />
      )}
      {profileModalOpen && (
        <PublicProfileModal onClose={() => setProfileModalOpen(false)} />
      )}
      {notificationsOpen && (
        <AccessNotificationModal
          requests={accessRequests}
          connected={sharedArchiveConnected}
          loading={accessRequestsLoading}
          error={accessRequestsError}
          onRefresh={refreshAccessRequests}
          onReview={reviewAccessRequest}
          onClose={() => setNotificationsOpen(false)}
        />
      )}
      <aside className="sidebar">
        <div className="brand brand-logo-only">
          <div className="brand-mark">
            <img src="/mcdf-logo.png" alt="MCDF" />
          </div>
        </div>
        <nav className="side-nav">
          {visibleNavSections.map((section) => (
            <div key={section.title} className="nav-section">
              <div className="nav-title">{section.title}</div>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={
                    activeTab === item.id ? "nav-item active" : "nav-item"
                  }
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="profile-card sharing-card compact-sharing-card identity-mini-card">
          <button
            className="identity-mini-text identity-open-button"
            type="button"
            onClick={() => setProfileModalOpen(true)}
            title="Open public profile"
          >
            <strong>{storedPublisherDisplayName()}</strong>
            {storedPublisherPermissions(
              sharedArchiveConnected,
              clientAuthReady,
            ) && (
              <small>
                {storedPublisherPermissions(
                  sharedArchiveConnected,
                  clientAuthReady,
                )}
              </small>
            )}
          </button>
          <button
            className={
              sharedArchiveConnected
                ? "switch-button connected"
                : "switch-button"
            }
            onClick={() =>
              sharedArchiveConnected ? handleDisconnect() : openConnectModal()
            }
            type="button"
          >
            <span className="switch-knob" />
            <span>{sharedArchiveConnected ? "Connected" : "Connect"}</span>
          </button>
        </div>
      </aside>
      <div className="content-shell">
        <div
          className="window-drag-strip"
          data-tauri-drag-region
          onMouseDown={startWindowDrag}
          aria-hidden="true"
        />
        <header
          className="topbar"
          data-tauri-drag-region
          onMouseDown={startWindowDrag}
        >
          <div className="topbar-title" data-tauri-drag-region>
            <h1 data-tauri-drag-region>{activeLabel}</h1>
          </div>
          <div
            className="topbar-stars"
            data-tauri-drag-region
            aria-hidden="true"
          >
            ✦ ✧ ✦
          </div>
          <div
            className="topbar-actions"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <IconButton label="Add MCDF entry" onClick={openAddEntryModal}>
              ＋
            </IconButton>
            <ActivityIndicator operations={operations} />
            <BellButton
              requests={accessRequests}
              onClick={() => setNotificationsOpen(true)}
            />
          </div>
          <div
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <WindowControls />
          </div>
        </header>
        <main className="content-area">
          {activeTab === "published" && (
            <PublishedIndexPanel
              sharedArchiveConnected={sharedArchiveConnected}
            />
          )}
          {activeTab === "library" && <OnlineLibraryPanel {...panelProps} />}
          {activeTab === "prepare" && (
            <PreparePanel {...panelProps} autoOpenSignal={analyzeOpenSignal} />
          )}
          {activeTab === "settings" && (
            <SettingsPanel
              sharedArchiveConnected={sharedArchiveConnected}
              onOpenConnect={openConnectModal}
              onDisconnect={handleDisconnect}
            />
          )}
          {activeTab === "admin" && adminTokenConfigured && (
            <SystemAdminPanel sharedArchiveConnected={sharedArchiveConnected} />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
