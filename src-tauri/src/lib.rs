mod commands;
mod local_cache;
pub mod mcdf;
mod online_locations;
mod vault_manifest;

pub use commands::{
    add_online_location, analyze_mcdf, admin_remove_exchange_entry, fetch_exchange_reports, central_server_health, create_local_manifest, export_public_index, fetch_archive_config, fetch_archive_ca_status, export_client_auth_package, import_client_auth_package, fetch_public_index_status, fetch_public_index_diagnostics, fetch_public_marketplace_index, fetch_public_package_record, fetch_publisher_identity, issue_publisher_certificate, register_publisher_identity, report_exchange_entry, review_exchange_report, resolve_archive_endpoint, download_package_from_archive, download_package_from_exchange_index, inspect_exchange_package_cache, clear_exchange_package_cache, fetch_storage_catalog, create_manifest_from_online_entry, export_local_mcdf_file, get_app_version,
    get_storage_settings, save_storage_settings, get_cache_dir, clear_download_cache, inspect_manifest_status, inspect_mcdf_files, probe_mcdf_hash_manifest, list_online_locations, read_manifest, rebuild_from_manifest,
    remove_online_location, scan_mcdf, scan_remote_mcdf_metadata, scan_online_location, scan_online_locations, upload_mcdf_to_central_server, fetch_access_requests, review_access_request, request_locked_mcdf_access,
    window_close, window_minimize, window_toggle_maximize, ensure_public_index_ssh_key, test_public_index_ssh_key, generate_admin_token, fetch_server_user_permissions, update_server_user_upload_permission, update_server_user_permissions, fetch_admin_server_settings, update_admin_server_settings, fetch_moderation_blocklist, add_moderation_block,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            add_online_location,
            analyze_mcdf,
            central_server_health,
            create_local_manifest,
            export_public_index,
            fetch_archive_config,
            fetch_archive_ca_status,
            export_client_auth_package,
            import_client_auth_package,
            fetch_public_index_status,
            fetch_public_index_diagnostics,
            fetch_public_marketplace_index,
            fetch_public_package_record,
            fetch_publisher_identity,
            issue_publisher_certificate,
            register_publisher_identity,
            resolve_archive_endpoint,
            download_package_from_archive, download_package_from_exchange_index, inspect_exchange_package_cache, clear_exchange_package_cache,
            fetch_storage_catalog,
            create_manifest_from_online_entry,
            export_local_mcdf_file,
            get_app_version,
            get_storage_settings,
            save_storage_settings,
            get_cache_dir,
            clear_download_cache,
            inspect_manifest_status,
            inspect_mcdf_files,
            probe_mcdf_hash_manifest,
            list_online_locations,
            read_manifest,
            rebuild_from_manifest,
            remove_online_location,
            scan_mcdf,
            scan_remote_mcdf_metadata,
            scan_online_location,
            scan_online_locations,
            upload_mcdf_to_central_server,
            fetch_access_requests,
            review_access_request,
            request_locked_mcdf_access,
            fetch_exchange_reports,
            report_exchange_entry,
            review_exchange_report,
            admin_remove_exchange_entry,
            window_close,
            window_minimize,
            window_toggle_maximize,
            ensure_public_index_ssh_key,
            test_public_index_ssh_key, generate_admin_token, fetch_server_user_permissions, update_server_user_upload_permission, update_server_user_permissions, fetch_admin_server_settings, update_admin_server_settings, fetch_moderation_blocklist, add_moderation_block,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
