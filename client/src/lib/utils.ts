import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type a_text_align_option_data = "left" | "center" | "right"

type a_auto_fit_text_option_payload_data = {
  minSize?: number
  maxSize?: number
  step?: number
  lineHeightRatio?: number
  fontFamily: string
  isBold?: boolean
  isItalic?: boolean
  maxWidth: number
  maxHeight: number
}

type a_layout_text_to_box_option_payload_data = {
  boxWidth: number
  boxHeight: number
  horizontalPadding?: number
  verticalPadding?: number
} & Omit<a_auto_fit_text_option_payload_data, "maxWidth" | "maxHeight">

type a_layout_text_to_box_result_payload_data = {
  fontSize: number
  lines: string[]
  lineHeight: number
  maxWidth: number
  maxHeight: number
}

const a_apply_canvas_font_style_data = (
  a_canvas_context_data: CanvasRenderingContext2D,
  a_font_size_data: number,
  a_font_family_data: string,
  a_is_bold_data: boolean,
  a_is_italic_data: boolean,
) => {
  a_canvas_context_data.font = `${a_is_italic_data ? "italic " : ""}${a_is_bold_data ? "bold " : ""}${a_font_size_data}px ${a_font_family_data}`
}

const a_strict_wrap_text_line_list_data = (
  a_raw_text_data: string,
  a_canvas_context_data: CanvasRenderingContext2D,
  a_max_width_data: number,
): string[] => {
  const a_words_data = a_raw_text_data.split(" ")
  const a_line_list_data: string[] = []
  let a_current_line_data = ""

  a_words_data.forEach((a_word_data) => {
    const a_test_line_data = a_current_line_data ? `${a_current_line_data} ${a_word_data}` : a_word_data
    if (a_canvas_context_data.measureText(a_test_line_data).width > a_max_width_data && a_current_line_data) {
      a_line_list_data.push(a_current_line_data)
      a_current_line_data = a_word_data
    } else {
      a_current_line_data = a_test_line_data
    }
  })

  if (a_current_line_data) a_line_list_data.push(a_current_line_data)

  // Pass 2: fix single-word orphans anywhere in the middle.
  for (let a_index_data = a_line_list_data.length - 1; a_index_data >= 1; a_index_data -= 1) {
    if (a_line_list_data[a_index_data].trim().split(" ").length === 1) {
      const a_merged_line_data = `${a_line_list_data[a_index_data - 1]} ${a_line_list_data[a_index_data]}`
      if (a_canvas_context_data.measureText(a_merged_line_data).width <= a_max_width_data) {
        a_line_list_data.splice(a_index_data - 1, 2, a_merged_line_data)
      } else {
        const a_previous_word_list_data = a_line_list_data[a_index_data - 1].trim().split(" ")
        if (a_previous_word_list_data.length > 1) {
          const a_moved_word_data = a_previous_word_list_data[a_previous_word_list_data.length - 1]
          a_line_list_data[a_index_data - 1] = a_previous_word_list_data.slice(0, -1).join(" ")
          a_line_list_data[a_index_data] = `${a_moved_word_data} ${a_line_list_data[a_index_data]}`
        }
      }
    }
  }

  // Pass 3: merge last line if it has <= 2 words and fits.
  if (a_line_list_data.length > 1) {
    const a_last_word_list_data = a_line_list_data[a_line_list_data.length - 1].trim().split(" ")
    if (a_last_word_list_data.length <= 2) {
      const a_merged_line_data = `${a_line_list_data[a_line_list_data.length - 2]} ${a_line_list_data[a_line_list_data.length - 1]}`
      if (a_canvas_context_data.measureText(a_merged_line_data).width <= a_max_width_data) {
        a_line_list_data.splice(a_line_list_data.length - 2, 2, a_merged_line_data)
      }
    }
  }

  return a_line_list_data
}

const a_auto_fit_text_payload_data = (
  a_raw_text_data: string,
  a_canvas_context_data: CanvasRenderingContext2D,
  a_option_data: a_auto_fit_text_option_payload_data,
) => {
  const a_min_size_data = a_option_data.minSize ?? 10
  const a_max_size_data = a_option_data.maxSize ?? 160
  const a_step_data = a_option_data.step ?? 2
  const a_line_height_ratio_data = a_option_data.lineHeightRatio ?? 1.4
  const a_font_family_data = a_option_data.fontFamily
  const a_is_bold_data = a_option_data.isBold ?? false
  const a_is_italic_data = a_option_data.isItalic ?? false
  const a_max_width_data = Math.max(1, a_option_data.maxWidth)
  const a_max_height_data = Math.max(1, a_option_data.maxHeight)
  const a_safe_step_data = a_step_data > 0 ? a_step_data : 2

  let a_font_size_data = a_max_size_data
  let a_line_list_data: string[] = []

  while (a_font_size_data > a_min_size_data) {
    a_apply_canvas_font_style_data(
      a_canvas_context_data,
      a_font_size_data,
      a_font_family_data,
      a_is_bold_data,
      a_is_italic_data,
    )
    a_line_list_data = a_strict_wrap_text_line_list_data(a_raw_text_data, a_canvas_context_data, a_max_width_data)
    const a_line_height_data = a_font_size_data * a_line_height_ratio_data
    if (a_line_list_data.length * a_line_height_data <= a_max_height_data) break
    a_font_size_data -= a_safe_step_data
  }

  if (a_font_size_data < a_min_size_data) {
    a_font_size_data = a_min_size_data
  }

  a_apply_canvas_font_style_data(
    a_canvas_context_data,
    a_font_size_data,
    a_font_family_data,
    a_is_bold_data,
    a_is_italic_data,
  )
  a_line_list_data = a_strict_wrap_text_line_list_data(a_raw_text_data, a_canvas_context_data, a_max_width_data)
  const a_line_height_data = a_font_size_data * a_line_height_ratio_data

  return {
    fontSize: a_font_size_data,
    lines: a_line_list_data,
    lineHeight: a_line_height_data,
  }
}

const a_layout_text_to_box_payload_data = (
  a_raw_text_data: string,
  a_canvas_context_data: CanvasRenderingContext2D,
  a_option_data: a_layout_text_to_box_option_payload_data,
): a_layout_text_to_box_result_payload_data => {
  const a_horizontal_padding_data = a_option_data.horizontalPadding ?? 28
  const a_vertical_padding_data = a_option_data.verticalPadding ?? 28
  const a_max_width_data = Math.max(1, a_option_data.boxWidth - a_horizontal_padding_data * 2)
  const a_max_height_data = Math.max(1, a_option_data.boxHeight - a_vertical_padding_data * 2)
  const a_fit_result_data = a_auto_fit_text_payload_data(a_raw_text_data, a_canvas_context_data, {
    ...a_option_data,
    maxWidth: a_max_width_data,
    maxHeight: a_max_height_data,
  })

  return {
    ...a_fit_result_data,
    maxWidth: a_max_width_data,
    maxHeight: a_max_height_data,
  }
}

export {
  a_strict_wrap_text_line_list_data as strictWrap,
  a_auto_fit_text_payload_data as autoFitText,
  a_layout_text_to_box_payload_data as layoutTextToBox,
}

export type {
  a_text_align_option_data as TextAlign,
  a_auto_fit_text_option_payload_data as AutoFitTextOptions,
  a_layout_text_to_box_option_payload_data as LayoutTextToBoxOptions,
  a_layout_text_to_box_result_payload_data as LayoutTextToBoxResult,
}
