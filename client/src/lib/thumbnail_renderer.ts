import { layoutTextToBox } from "@/lib/utils";
import type { PlaceholderElement, TemplateData } from "@/pages/tools/ThumbnailCreator";

const a_template_fallback_canvas_space_map_data = {
  youtube: { width: 720, height: 405 },
  tiktok: { width: 340, height: Math.round((340 * 16) / 9) },
} as const;

type a_electron_api_shape_data = {
  readFileAsBase64?: (a_file_path_text_data: string) => Promise<string>;
};

type a_window_extension_shape_data = Window & {
  electronAPI?: a_electron_api_shape_data;
  require?: (a_module_name_text_data: string) => unknown;
};

type a_fs_module_shape_data = {
  existsSync: (a_file_path_text_data: string) => boolean;
  readFileSync: (a_file_path_text_data: string) => { toString: (a_encoding_text_data?: string) => string };
};

type a_path_module_shape_data = {
  extname: (a_file_path_text_data: string) => string;
};

const a_to_rgba_text_data = (a_hex_text_data: string, a_opacity_number_data: number) => {
  const a_red_number_data = parseInt(a_hex_text_data.slice(1, 3), 16);
  const a_green_number_data = parseInt(a_hex_text_data.slice(3, 5), 16);
  const a_blue_number_data = parseInt(a_hex_text_data.slice(5, 7), 16);
  return `rgba(${a_red_number_data},${a_green_number_data},${a_blue_number_data},${a_opacity_number_data / 100})`;
};

const a_normalize_placeholder_settings_data = (a_placeholder_data: PlaceholderElement): PlaceholderElement => ({
  ...a_placeholder_data,
  placeholderType: a_placeholder_data.placeholderType ?? "image",
  fontFamily: a_placeholder_data.fontFamily ?? "Impact",
  textAlign: a_placeholder_data.textAlign ?? "left",
  textColor: a_placeholder_data.textColor ?? "#000000",
});

const a_get_template_canvas_space_data = (a_template_data: TemplateData) => {
  const a_fallback_data = a_template_fallback_canvas_space_map_data[a_template_data.pageSize];
  const a_width_data = a_template_data.canvasWidth && a_template_data.canvasWidth > 0
    ? a_template_data.canvasWidth
    : a_fallback_data.width;
  const a_height_data = a_template_data.canvasHeight && a_template_data.canvasHeight > 0
    ? a_template_data.canvasHeight
    : a_fallback_data.height;

  return { width: a_width_data, height: a_height_data };
};

const a_guess_mime_type_from_file_path_data = (a_file_path_text_data: string): string => {
  const a_file_extension_text_data = a_file_path_text_data.toLowerCase().split(".").pop() ?? "";
  if (a_file_extension_text_data === "png") return "image/png";
  if (a_file_extension_text_data === "jpg" || a_file_extension_text_data === "jpeg") return "image/jpeg";
  if (a_file_extension_text_data === "webp") return "image/webp";
  if (a_file_extension_text_data === "gif") return "image/gif";
  if (a_file_extension_text_data === "svg") return "image/svg+xml";
  return "application/octet-stream";
};

const a_source_is_remote_or_data_url_data = (a_source_text_data: string): boolean => {
  return (
    a_source_text_data.startsWith("http://") ||
    a_source_text_data.startsWith("https://") ||
    a_source_text_data.startsWith("data:") ||
    a_source_text_data.startsWith("blob:")
  );
};

const a_try_convert_local_path_to_data_url_data = async (a_source_text_data: string): Promise<string> => {
  const a_source_trimmed_text_data = a_source_text_data.trim();
  if (!a_source_trimmed_text_data || a_source_is_remote_or_data_url_data(a_source_trimmed_text_data)) {
    return a_source_trimmed_text_data;
  }

  const a_window_data = window as unknown as a_window_extension_shape_data;

  if (typeof a_window_data.electronAPI?.readFileAsBase64 === "function") {
    try {
      const a_data_url_text_data = await a_window_data.electronAPI.readFileAsBase64(a_source_trimmed_text_data);
      if (a_data_url_text_data.startsWith("data:")) return a_data_url_text_data;
    } catch {
      // continue to nodeIntegration path fallback
    }
  }

  if (typeof a_window_data.require === "function") {
    try {
      const a_fs_module_data = a_window_data.require("fs") as a_fs_module_shape_data;
      const a_path_module_data = a_window_data.require("path") as a_path_module_shape_data;
      if (a_fs_module_data.existsSync(a_source_trimmed_text_data)) {
        const a_buffer_data = a_fs_module_data.readFileSync(a_source_trimmed_text_data);
        const a_extension_text_data = a_path_module_data.extname(a_source_trimmed_text_data);
        const a_mime_text_data = a_guess_mime_type_from_file_path_data(a_extension_text_data);
        return `data:${a_mime_text_data};base64,${a_buffer_data.toString("base64")}`;
      }
    } catch {
      // continue with original src
    }
  }

  return a_source_trimmed_text_data;
};

const a_load_image_data = async (a_source_text_data: string): Promise<HTMLImageElement> => {
  const a_effective_source_text_data = await a_try_convert_local_path_to_data_url_data(a_source_text_data);

  return new Promise((a_resolve_data, a_reject_data) => {
    const a_image_data = new Image();
    a_image_data.crossOrigin = "anonymous";
    a_image_data.onload = () => a_resolve_data(a_image_data);
    a_image_data.onerror = () => a_reject_data(new Error("Failed to load image"));
    a_image_data.src = a_effective_source_text_data;
  });
};

const a_draw_image_cover_in_box_data = (
  a_canvas_context_data: CanvasRenderingContext2D,
  a_image_data: HTMLImageElement,
  a_box_x_data: number,
  a_box_y_data: number,
  a_box_width_data: number,
  a_box_height_data: number,
) => {
  if (a_box_width_data <= 0 || a_box_height_data <= 0 || a_image_data.width <= 0 || a_image_data.height <= 0) return;
  const a_image_aspect_data = a_image_data.width / a_image_data.height;
  const a_box_aspect_data = a_box_width_data / a_box_height_data;

  let a_src_x_data = 0, a_src_y_data = 0;
  let a_src_width_data = a_image_data.width, a_src_height_data = a_image_data.height;

  if (a_image_aspect_data > a_box_aspect_data) {
    // image wider than box — crop sides, center horizontally
    a_src_width_data = a_image_data.height * a_box_aspect_data;
    a_src_x_data = (a_image_data.width - a_src_width_data) / 2;
  } else {
    // image taller than box — crop top/bottom, center vertically
    a_src_height_data = a_image_data.width / a_box_aspect_data;
    a_src_y_data = (a_image_data.height - a_src_height_data) / 2;
  }

  a_canvas_context_data.drawImage(
    a_image_data,
    a_src_x_data, a_src_y_data, a_src_width_data, a_src_height_data,
    a_box_x_data, a_box_y_data, a_box_width_data, a_box_height_data,
  );
};

const a_draw_image_contain_in_box_data = (
  a_canvas_context_data: CanvasRenderingContext2D,
  a_image_data: HTMLImageElement,
  a_box_x_data: number,
  a_box_y_data: number,
  a_box_width_data: number,
  a_box_height_data: number,
) => {
  if (a_box_width_data <= 0 || a_box_height_data <= 0 || a_image_data.width <= 0 || a_image_data.height <= 0) return;
  const a_image_aspect_data = a_image_data.width / a_image_data.height;
  const a_box_aspect_data = a_box_width_data / a_box_height_data;

  let a_draw_width_data = a_box_width_data;
  let a_draw_height_data = a_box_height_data;
  let a_draw_x_data = a_box_x_data;
  let a_draw_y_data = a_box_y_data;

  if (a_image_aspect_data > a_box_aspect_data) {
    a_draw_height_data = a_box_width_data / a_image_aspect_data;
    a_draw_y_data = a_box_y_data + (a_box_height_data - a_draw_height_data) / 2;
  } else {
    a_draw_width_data = a_box_height_data * a_image_aspect_data;
    a_draw_x_data = a_box_x_data + (a_box_width_data - a_draw_width_data) / 2;
  }

  a_canvas_context_data.drawImage(a_image_data, a_draw_x_data, a_draw_y_data, a_draw_width_data, a_draw_height_data);
};

const a_draw_text_placeholder_data = (
  a_canvas_context_data: CanvasRenderingContext2D,
  a_placeholder_data: PlaceholderElement,
  a_cell_value_data: string,
  a_scale_x_data: number,
  a_scale_y_data: number,
) => {
  const a_text_data = a_cell_value_data.trim();
  if (!a_text_data) return;

  const a_box_x_data = a_placeholder_data.x * a_scale_x_data;
  const a_box_y_data = a_placeholder_data.y * a_scale_y_data;
  const a_box_width_data = a_placeholder_data.w * a_scale_x_data;
  const a_box_height_data = a_placeholder_data.h * a_scale_y_data;
  const a_padding_data = Math.max(8, Math.round(Math.min(a_box_width_data, a_box_height_data) * 0.08));

  const a_layout_data = layoutTextToBox(a_text_data, a_canvas_context_data, {
    boxWidth: a_box_width_data,
    boxHeight: a_box_height_data,
    horizontalPadding: a_padding_data,
    verticalPadding: a_padding_data,
    fontFamily: a_placeholder_data.fontFamily ?? "Impact",
    isBold: true,
    maxSize: 160,
    minSize: 10,
    step: 2,
    lineHeightRatio: 1.4,
  });

  a_canvas_context_data.save();
  a_canvas_context_data.fillStyle = a_placeholder_data.textColor ?? "#000000";
  a_canvas_context_data.textBaseline = "top";
  a_canvas_context_data.font = `bold ${a_layout_data.fontSize}px ${a_placeholder_data.fontFamily ?? "Impact"}`;
  a_canvas_context_data.textAlign = a_placeholder_data.textAlign ?? "left";

  const a_draw_x_data =
    (a_placeholder_data.textAlign ?? "left") === "center"
      ? a_box_x_data + a_box_width_data / 2
      : (a_placeholder_data.textAlign ?? "left") === "right"
        ? a_box_x_data + a_box_width_data - a_padding_data
        : a_box_x_data + a_padding_data;
  const a_draw_y_data = a_box_y_data + a_padding_data;

  a_layout_data.lines.forEach((a_line_data, a_index_data) => {
    a_canvas_context_data.fillText(a_line_data, a_draw_x_data, a_draw_y_data + a_index_data * a_layout_data.lineHeight);
  });
  a_canvas_context_data.restore();
};

const a_preload_fonts_data = async (a_template_data: TemplateData): Promise<void> => {
  const a_font_families_data = new Set<string>();
  for (const a_element_data of a_template_data.elements) {
    if (a_element_data.type === "placeholder") {
      const a_font_data = (a_element_data as PlaceholderElement).fontFamily;
      if (a_font_data) a_font_families_data.add(a_font_data);
    }
  }
  // Wait for @font-face rules (incl. Google Fonts stylesheet) to be processed
  // before requesting specific font weights; otherwise document.fonts.load
  // silently resolves with an empty set and the canvas falls back to system fonts.
  await document.fonts.ready.catch(() => {});
  await Promise.all(
    Array.from(a_font_families_data).map((a_font_name_data) =>
      document.fonts.load(`bold 40px "${a_font_name_data}"`).catch(() => {})
    )
  );
  // Warm up each font by actually drawing with it on a throwaway canvas.
  // document.fonts.load() only ensures the bytes are available — the canvas
  // rendering engine still needs one real draw call to fully register the font.
  // Without this, the first batch render uses the fallback font.
  const a_warmup_canvas_data = document.createElement("canvas");
  const a_warmup_ctx_data = a_warmup_canvas_data.getContext("2d");
  if (a_warmup_ctx_data) {
    for (const a_font_name_data of Array.from(a_font_families_data)) {
      a_warmup_ctx_data.font = `bold 40px "${a_font_name_data}"`;
      a_warmup_ctx_data.fillText("\u200b", 0, 0); // zero-width space, invisible
    }
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

const a_render_thumbnail_data = async (
  a_template_data: TemplateData,
  a_placeholder_map_data: Record<string, string>,
): Promise<string> => {
  await a_preload_fonts_data(a_template_data);

  const a_output_width_data = a_template_data.pageSize === "youtube" ? 1280 : 1080;
  const a_output_height_data = a_template_data.pageSize === "youtube" ? 720 : 1920;

  const a_canvas_data = document.createElement("canvas");
  a_canvas_data.width = a_output_width_data;
  a_canvas_data.height = a_output_height_data;
  const a_canvas_context_data = a_canvas_data.getContext("2d");
  if (!a_canvas_context_data) {
    throw new Error("Canvas context unavailable");
  }

  const {
    color1: a_color_first_text_data,
    opacity1: a_opacity_first_number_data,
    transparent1: a_transparent_first_flag_data,
    color2: a_color_second_text_data,
    opacity2: a_opacity_second_number_data,
    transparent2: a_transparent_second_flag_data,
    mode: a_gradient_mode_text_data,
    split: a_split_percent_number_data,
    pageSize: a_page_size_text_data,
  } = a_template_data;

  const a_draw_gradient_data = () => {
    if (a_transparent_first_flag_data && a_transparent_second_flag_data) return;
    const a_gradient_color_first_text_data = a_transparent_first_flag_data ? "rgba(0,0,0,0)" : a_to_rgba_text_data(a_color_first_text_data, a_opacity_first_number_data);
    const a_gradient_color_second_text_data = a_transparent_second_flag_data ? "rgba(0,0,0,0)" : a_to_rgba_text_data(a_color_second_text_data, a_opacity_second_number_data);
    const a_gradient_data = a_page_size_text_data === "youtube"
      ? a_canvas_context_data.createLinearGradient(0, 0, a_output_width_data, 0)
      : a_canvas_context_data.createLinearGradient(0, 0, 0, a_output_height_data);
    if (a_gradient_mode_text_data === "gradient-split") {
      const a_split_ratio_data = a_split_percent_number_data / 100;
      a_gradient_data.addColorStop(0, a_gradient_color_first_text_data);
      a_gradient_data.addColorStop(Math.max(0, a_split_ratio_data - 0.001), a_gradient_color_first_text_data);
      a_gradient_data.addColorStop(Math.min(1, a_split_ratio_data + 0.001), a_gradient_color_second_text_data);
      a_gradient_data.addColorStop(1, a_gradient_color_second_text_data);
    } else {
      const a_split_ratio_data = a_split_percent_number_data / 100;
      a_gradient_data.addColorStop(0, a_gradient_color_first_text_data);
      a_gradient_data.addColorStop(Math.max(0, a_split_ratio_data - 0.05), a_gradient_color_first_text_data);
      a_gradient_data.addColorStop(Math.min(1, a_split_ratio_data + 0.05), a_gradient_color_second_text_data);
      a_gradient_data.addColorStop(1, a_gradient_color_second_text_data);
    }
    a_canvas_context_data.fillStyle = a_gradient_data;
    a_canvas_context_data.fillRect(0, 0, a_output_width_data, a_output_height_data);
  };

  const a_template_canvas_space_data = a_get_template_canvas_space_data(a_template_data);
  const a_scale_x_data = a_output_width_data / a_template_canvas_space_data.width;
  const a_scale_y_data = a_output_height_data / a_template_canvas_space_data.height;

  // Draw order: bottomLayer elements → gradient → rest
  const a_bottom_elements_data = a_template_data.elements.filter(e => (e as any).bottomLayer);
  const a_top_elements_data = a_template_data.elements.filter(e => !(e as any).bottomLayer);

  for (const a_element_data of a_bottom_elements_data) {
    if (a_element_data.type === "placeholder") {
      const a_placeholder_data = a_normalize_placeholder_settings_data(a_element_data as PlaceholderElement);
      const a_cell_value_data = String(a_placeholder_map_data[a_placeholder_data.name] ?? "");
      if (!a_cell_value_data.trim()) continue;

      if (a_placeholder_data.placeholderType === "text") {
        a_draw_text_placeholder_data(a_canvas_context_data, a_placeholder_data, a_cell_value_data, a_scale_x_data, a_scale_y_data);
      } else {
        try {
          const a_image_data = await a_load_image_data(a_cell_value_data.trim());
          a_draw_image_cover_in_box_data(
            a_canvas_context_data,
            a_image_data,
            a_placeholder_data.x * a_scale_x_data,
            a_placeholder_data.y * a_scale_y_data,
            a_placeholder_data.w * a_scale_x_data,
            a_placeholder_data.h * a_scale_y_data,
          );
        } catch {
          // skip failed image placeholders
        }
      }
      continue;
    }

    const a_static_image_data = a_element_data as { src?: string; opacity?: number; x: number; y: number; w: number; h: number };
    if (!a_static_image_data.src) continue;
    try {
      const a_image_data = await a_load_image_data(a_static_image_data.src);
      a_canvas_context_data.globalAlpha = (a_static_image_data.opacity ?? 100) / 100;
      a_draw_image_contain_in_box_data(
        a_canvas_context_data,
        a_image_data,
        a_static_image_data.x * a_scale_x_data,
        a_static_image_data.y * a_scale_y_data,
        a_static_image_data.w * a_scale_x_data,
        a_static_image_data.h * a_scale_y_data,
      );
      a_canvas_context_data.globalAlpha = 1;
    } catch {
      // skip failed static images
    }
  }

  a_draw_gradient_data();

  for (const a_element_data of a_top_elements_data) {
    if (a_element_data.type === "placeholder") {
      const a_placeholder_data = a_normalize_placeholder_settings_data(a_element_data as PlaceholderElement);
      const a_cell_value_data = String(a_placeholder_map_data[a_placeholder_data.name] ?? "");
      if (!a_cell_value_data.trim()) continue;

      if (a_placeholder_data.placeholderType === "text") {
        a_draw_text_placeholder_data(a_canvas_context_data, a_placeholder_data, a_cell_value_data, a_scale_x_data, a_scale_y_data);
      } else {
        try {
          const a_image_data = await a_load_image_data(a_cell_value_data.trim());
          a_draw_image_cover_in_box_data(
            a_canvas_context_data,
            a_image_data,
            a_placeholder_data.x * a_scale_x_data,
            a_placeholder_data.y * a_scale_y_data,
            a_placeholder_data.w * a_scale_x_data,
            a_placeholder_data.h * a_scale_y_data,
          );
        } catch {
          // skip failed image placeholders
        }
      }
      continue;
    }

    const a_static_image_data = a_element_data as { src?: string; opacity?: number; x: number; y: number; w: number; h: number };
    if (!a_static_image_data.src) continue;
    try {
      const a_image_data = await a_load_image_data(a_static_image_data.src);
      a_canvas_context_data.globalAlpha = (a_static_image_data.opacity ?? 100) / 100;
      a_draw_image_contain_in_box_data(
        a_canvas_context_data,
        a_image_data,
        a_static_image_data.x * a_scale_x_data,
        a_static_image_data.y * a_scale_y_data,
        a_static_image_data.w * a_scale_x_data,
        a_static_image_data.h * a_scale_y_data,
      );
      a_canvas_context_data.globalAlpha = 1;
    } catch {
      // skip failed static images
    }
  }

  return a_canvas_data.toDataURL("image/png");
};

export { a_render_thumbnail_data as renderThumbnail };
