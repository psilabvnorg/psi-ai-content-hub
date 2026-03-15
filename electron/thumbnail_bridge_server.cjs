const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');

const a_thumbnail_bridge_port_number_data = Number(process.env.THUMBNAIL_BRIDGE_PORT || 6915);
const a_thumbnail_bridge_host_text_data = '127.0.0.1';

let a_thumbnail_bridge_server_instance_data = null;
let a_thumbnail_bridge_hidden_window_instance_data = null;

const a_get_thumbnail_temp_directory_path_data = () => path.join(os.tmpdir(), 'psi_ai_content_hub');

const a_ensure_thumbnail_temp_directory_exists_data = () => {
  const a_temp_directory_path_data = a_get_thumbnail_temp_directory_path_data();
  if (!fs.existsSync(a_temp_directory_path_data)) {
    fs.mkdirSync(a_temp_directory_path_data, { recursive: true });
  }
  return a_temp_directory_path_data;
};

const a_guess_mime_from_file_path_data = (a_file_path_text_data) => {
  const a_file_extension_text_data = path.extname(a_file_path_text_data).toLowerCase();
  if (a_file_extension_text_data === '.png') return 'image/png';
  if (a_file_extension_text_data === '.jpg' || a_file_extension_text_data === '.jpeg') return 'image/jpeg';
  if (a_file_extension_text_data === '.webp') return 'image/webp';
  if (a_file_extension_text_data === '.gif') return 'image/gif';
  if (a_file_extension_text_data === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
};

const a_sanitize_file_name_text_data = (a_text_data) => {
  const a_raw_text_data = String(a_text_data || '').trim();
  if (!a_raw_text_data) return 'untitled';
  const a_clean_text_data = a_raw_text_data.replace(/[^a-zA-Z0-9_\-]+/g, '_').replace(/^[._]+|[._]+$/g, '');
  return a_clean_text_data || 'untitled';
};

const a_read_http_request_json_payload_data = (a_request_data) => new Promise((a_resolve_data, a_reject_data) => {
  const a_chunk_list_data = [];
  a_request_data.on('data', (a_chunk_data) => {
    a_chunk_list_data.push(a_chunk_data);
  });
  a_request_data.on('end', () => {
    try {
      const a_raw_text_data = Buffer.concat(a_chunk_list_data).toString('utf8');
      const a_payload_data = a_raw_text_data ? JSON.parse(a_raw_text_data) : {};
      a_resolve_data(a_payload_data);
    } catch (a_error_data) {
      a_reject_data(new Error(`Invalid JSON payload: ${a_error_data.message}`));
    }
  });
  a_request_data.on('error', (a_error_data) => {
    a_reject_data(a_error_data);
  });
});

const a_send_json_http_response_data = (a_response_data, a_status_code_number_data, a_payload_data) => {
  const a_body_text_data = JSON.stringify(a_payload_data);
  a_response_data.writeHead(a_status_code_number_data, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(a_body_text_data),
  });
  a_response_data.end(a_body_text_data);
};

const a_get_hidden_window_dev_url_text_data = () => process.env.THUMBNAIL_BRIDGE_RENDERER_URL || 'http://localhost:5000';

const a_get_hidden_window_prod_index_path_text_data = () => {
  const a_candidate_path_list_data = [
    path.join(app.getAppPath(), 'dist', 'public', 'index.html'),
    path.join(__dirname, '..', 'dist', 'public', 'index.html'),
  ];
  const a_existing_path_data = a_candidate_path_list_data.find((a_candidate_path_text_data) => fs.existsSync(a_candidate_path_text_data));
  if (!a_existing_path_data) {
    throw new Error(`Renderer index.html not found. Checked: ${a_candidate_path_list_data.join(', ')}`);
  }
  return a_existing_path_data;
};

const a_wait_for_shared_renderer_ready_data = async (a_window_data) => {
  const a_ready_script_text_data = `
new Promise((a_resolve_data, a_reject_data) => {
  const a_started_at_number_data = Date.now();
  const a_check_data = () => {
    const a_ok_data = Boolean(
      window.__thumbnail_renderer_data &&
      typeof window.__thumbnail_renderer_data.renderThumbnail === "function"
    );
    if (a_ok_data) {
      a_resolve_data(true);
      return;
    }
    if (Date.now() - a_started_at_number_data > 15000) {
      a_reject_data(new Error("Shared thumbnail renderer was not initialized in renderer window"));
      return;
    }
    setTimeout(a_check_data, 100);
  };
  a_check_data();
})
`;
  await a_window_data.webContents.executeJavaScript(a_ready_script_text_data, true);
};

const a_load_hidden_renderer_window_data = async (a_window_data) => {
  if (app.isPackaged) {
    const a_index_path_text_data = a_get_hidden_window_prod_index_path_text_data();
    await a_window_data.loadFile(a_index_path_text_data);
  } else {
    const a_renderer_url_text_data = a_get_hidden_window_dev_url_text_data();
    await a_window_data.loadURL(a_renderer_url_text_data);
  }
  await a_wait_for_shared_renderer_ready_data(a_window_data);
};

const a_ensure_hidden_renderer_window_data = async () => {
  if (a_thumbnail_bridge_hidden_window_instance_data && !a_thumbnail_bridge_hidden_window_instance_data.isDestroyed()) {
    await a_wait_for_shared_renderer_ready_data(a_thumbnail_bridge_hidden_window_instance_data);
    return a_thumbnail_bridge_hidden_window_instance_data;
  }

  const a_hidden_window_data = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
    },
  });

  a_hidden_window_data.on('closed', () => {
    a_thumbnail_bridge_hidden_window_instance_data = null;
  });

  await a_load_hidden_renderer_window_data(a_hidden_window_data);
  a_thumbnail_bridge_hidden_window_instance_data = a_hidden_window_data;
  return a_hidden_window_data;
};

const a_render_thumbnail_data_url_via_hidden_window_data = async (a_template_data, a_placeholder_map_data) => {
  const a_hidden_window_data = await a_ensure_hidden_renderer_window_data();
  const a_payload_encoded_text_data = encodeURIComponent(
    JSON.stringify({ template: a_template_data, placeholderMap: a_placeholder_map_data }),
  );
  const a_render_script_text_data = `
(async () => {
  if (!window.__thumbnail_renderer_data || typeof window.__thumbnail_renderer_data.renderThumbnail !== "function") {
    throw new Error("window.__thumbnail_renderer_data.renderThumbnail is unavailable");
  }
  const a_payload_data = JSON.parse(decodeURIComponent("${a_payload_encoded_text_data}"));
  return window.__thumbnail_renderer_data.renderThumbnail(a_payload_data.template, a_payload_data.placeholderMap || {});
})()
`;
  return a_hidden_window_data.webContents.executeJavaScript(a_render_script_text_data, true);
};

const a_convert_data_url_to_png_buffer_data = (a_data_url_text_data) => {
  const a_data_url_parts_data = String(a_data_url_text_data || '').split(',');
  if (a_data_url_parts_data.length < 2) {
    throw new Error('Invalid data URL returned from renderer');
  }
  return Buffer.from(a_data_url_parts_data[1], 'base64');
};

const a_render_batch_payload_data = async (a_payload_data) => {
  const a_template_data = a_payload_data?.template;
  const a_row_list_data = Array.isArray(a_payload_data?.rows) ? a_payload_data.rows : [];
  const a_label_column_text_data = String(a_payload_data?.label_column || '').trim();
  if (!a_template_data || typeof a_template_data !== 'object') {
    throw new Error('template is required');
  }
  if (a_row_list_data.length === 0) {
    throw new Error('rows is required');
  }

  const a_effective_label_column_text_data =
    a_label_column_text_data || String(Object.keys(a_row_list_data[0] || {})[0] || 'label');

  const a_temp_directory_path_data = a_ensure_thumbnail_temp_directory_exists_data();
  const a_batch_directory_path_data = path.join(a_temp_directory_path_data, `thumbnail_bridge_batch_${Date.now()}`);
  fs.mkdirSync(a_batch_directory_path_data, { recursive: true });

  // Throwaway warm-up render — fonts render incorrectly on the very first
  // canvas draw after being loaded. This sacrificial render absorbs that hit
  // so all real renders below are effectively "second runs".
  try {
    const a_warmup_placeholder_map_data = {};
    const a_first_row_data = a_row_list_data[0] || {};
    Object.keys(a_first_row_data).forEach((a_key_text_data) => {
      a_warmup_placeholder_map_data[String(a_key_text_data)] = String(a_first_row_data[a_key_text_data] ?? '');
    });
    await a_render_thumbnail_data_url_via_hidden_window_data(a_template_data, a_warmup_placeholder_map_data);
  } catch (_a_warmup_error_data) { /* ignore — warm-up failure must not abort the batch */ }

  const a_success_item_list_data = [];
  const a_failure_item_list_data = [];

  for (let a_row_index_number_data = 0; a_row_index_number_data < a_row_list_data.length; a_row_index_number_data += 1) {
    const a_row_data = a_row_list_data[a_row_index_number_data] || {};
    const a_placeholder_map_data = {};
    Object.keys(a_row_data).forEach((a_key_text_data) => {
      a_placeholder_map_data[String(a_key_text_data)] = String(a_row_data[a_key_text_data] ?? '');
    });

    const a_label_text_data = String(a_row_data[a_effective_label_column_text_data] || `row_${a_row_index_number_data + 1}`);
    const a_sanitized_label_text_data = a_sanitize_file_name_text_data(a_label_text_data);
    const a_file_name_text_data = `thumbnail_${a_sanitized_label_text_data}.png`;
    const a_file_path_text_data = path.join(a_batch_directory_path_data, `${String(a_row_index_number_data + 1).padStart(4, '0')}_${a_file_name_text_data}`);

    try {
      const a_data_url_text_data = await a_render_thumbnail_data_url_via_hidden_window_data(a_template_data, a_placeholder_map_data);
      const a_png_buffer_data = a_convert_data_url_to_png_buffer_data(a_data_url_text_data);
      fs.writeFileSync(a_file_path_text_data, a_png_buffer_data);
      a_success_item_list_data.push({
        row_index: a_row_index_number_data,
        label: a_label_text_data,
        filename: a_file_name_text_data,
        path: a_file_path_text_data,
        buffer: a_png_buffer_data,
      });
    } catch (a_error_data) {
      a_failure_item_list_data.push({
        row_index: a_row_index_number_data,
        label: a_label_text_data,
        error: String(a_error_data?.message || a_error_data),
      });
    }
  }

  if (a_success_item_list_data.length === 0) {
    throw new Error('All rows failed to render');
  }

  const a_first_success_item_data = a_success_item_list_data[0];
  const a_sample_file_name_text_data = `thumbnail_sample_${Date.now()}.png`;
  const a_sample_file_path_text_data = path.join(a_temp_directory_path_data, a_sample_file_name_text_data);
  fs.copyFileSync(a_first_success_item_data.path, a_sample_file_path_text_data);

  const a_archive_file_name_text_data = `thumbnails_${Date.now()}.zip`;
  const a_archive_file_path_text_data = path.join(a_temp_directory_path_data, a_archive_file_name_text_data);
  const a_zip_instance_data = new JSZip();
  a_success_item_list_data.forEach((a_item_data) => {
    a_zip_instance_data.file(a_item_data.filename, a_item_data.buffer);
  });
  const a_zip_buffer_data = await a_zip_instance_data.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(a_archive_file_path_text_data, a_zip_buffer_data);

  a_success_item_list_data.forEach((a_item_data) => {
    try {
      fs.unlinkSync(a_item_data.path);
    } catch (_a_error_data) {}
  });
  try {
    fs.rmSync(a_batch_directory_path_data, { recursive: true, force: true });
  } catch (_a_error_data) {}

  return {
    total_rows: a_row_list_data.length,
    success_rows: a_success_item_list_data.length,
    failed_rows: a_failure_item_list_data.length,
    sample: {
      row_index: a_first_success_item_data.row_index,
      label: a_first_success_item_data.label,
      filename: path.basename(a_sample_file_path_text_data),
      path: a_sample_file_path_text_data,
      mime: a_guess_mime_from_file_path_data(a_sample_file_path_text_data),
    },
    archive: {
      filename: path.basename(a_archive_file_path_text_data),
      path: a_archive_file_path_text_data,
      mime: 'application/zip',
    },
    failures: a_failure_item_list_data,
  };
};

const a_handle_thumbnail_bridge_http_request_data = async (a_request_data, a_response_data) => {
  if (a_request_data.method === 'GET' && a_request_data.url === '/thumbnail/health') {
    a_send_json_http_response_data(a_response_data, 200, { status: 'ok' });
    return;
  }

  if (a_request_data.method === 'POST' && a_request_data.url === '/thumbnail/render-batch') {
    try {
      const a_payload_data = await a_read_http_request_json_payload_data(a_request_data);
      const a_result_data = await a_render_batch_payload_data(a_payload_data);
      a_send_json_http_response_data(a_response_data, 200, a_result_data);
    } catch (a_error_data) {
      a_send_json_http_response_data(a_response_data, 500, {
        error: String(a_error_data?.message || a_error_data),
      });
    }
    return;
  }

  a_send_json_http_response_data(a_response_data, 404, { error: 'Not found' });
};

const a_start_thumbnail_bridge_server_data = () => new Promise((a_resolve_data, a_reject_data) => {
  if (a_thumbnail_bridge_server_instance_data) {
    a_resolve_data({ host: a_thumbnail_bridge_host_text_data, port: a_thumbnail_bridge_port_number_data });
    return;
  }

  const a_server_instance_data = http.createServer((a_request_data, a_response_data) => {
    a_handle_thumbnail_bridge_http_request_data(a_request_data, a_response_data)
      .catch((a_error_data) => {
        a_send_json_http_response_data(a_response_data, 500, { error: String(a_error_data?.message || a_error_data) });
      });
  });

  a_server_instance_data.on('error', (a_error_data) => {
    a_reject_data(a_error_data);
  });

  a_server_instance_data.listen(a_thumbnail_bridge_port_number_data, a_thumbnail_bridge_host_text_data, () => {
    a_thumbnail_bridge_server_instance_data = a_server_instance_data;
    a_resolve_data({ host: a_thumbnail_bridge_host_text_data, port: a_thumbnail_bridge_port_number_data });
  });
});

const a_stop_thumbnail_bridge_server_data = () => new Promise((a_resolve_data) => {
  const a_close_window_data = () => {
    if (a_thumbnail_bridge_hidden_window_instance_data && !a_thumbnail_bridge_hidden_window_instance_data.isDestroyed()) {
      a_thumbnail_bridge_hidden_window_instance_data.close();
    }
    a_thumbnail_bridge_hidden_window_instance_data = null;
  };

  if (!a_thumbnail_bridge_server_instance_data) {
    a_close_window_data();
    a_resolve_data();
    return;
  }

  a_thumbnail_bridge_server_instance_data.close(() => {
    a_thumbnail_bridge_server_instance_data = null;
    a_close_window_data();
    a_resolve_data();
  });
});

module.exports = {
  a_start_thumbnail_bridge_server_data,
  a_stop_thumbnail_bridge_server_data,
  a_thumbnail_bridge_port_number_data,
};
