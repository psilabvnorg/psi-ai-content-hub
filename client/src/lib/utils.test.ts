import { describe, expect, it } from "vitest";
import { autoFitText, layoutTextToBox, strictWrap } from "./utils";

const a_make_mock_canvas_context_data = (): CanvasRenderingContext2D => {
  const a_context_data = {
    font: "16px Impact",
    measureText(a_text_data: string) {
      const a_size_match_data = /(\d+(?:\.\d+)?)px/.exec(this.font);
      const a_font_size_data = a_size_match_data ? Number(a_size_match_data[1]) : 16;
      return { width: a_text_data.length * a_font_size_data * 0.6 } as TextMetrics;
    },
  };
  return a_context_data as unknown as CanvasRenderingContext2D;
};

describe("text layout helpers", () => {
  it("strictWrap wraps text and preserves one-line output when width is large", () => {
    const a_canvas_context_data = a_make_mock_canvas_context_data();
    a_canvas_context_data.font = "40px Impact";
    const a_max_width_data = 280;
    const a_raw_text_data = "Amazon WorkMail is a secure managed business email and calendar service";
    const a_line_list_data = strictWrap(
      a_raw_text_data,
      a_canvas_context_data,
      a_max_width_data,
    );
    const a_single_line_list_data = strictWrap(
      a_raw_text_data,
      a_canvas_context_data,
      9999,
    );

    expect(a_line_list_data.length).toBeGreaterThan(1);
    expect(a_single_line_list_data).toEqual([a_raw_text_data]);
    for (const a_line_data of a_line_list_data) {
      expect(a_line_data.trim().length).toBeGreaterThan(0);
    }
  });

  it("autoFitText uses default bounds and line-height ratio", () => {
    const a_canvas_context_data = a_make_mock_canvas_context_data();
    const a_fit_result_data = autoFitText(
      "A very long piece of text that should shrink to fit inside a small box.",
      a_canvas_context_data,
      {
        fontFamily: "Impact",
        maxWidth: 220,
        maxHeight: 95,
      },
    );

    expect(a_fit_result_data.fontSize).toBeLessThanOrEqual(160);
    expect(a_fit_result_data.fontSize).toBeGreaterThanOrEqual(10);
    expect(a_fit_result_data.lineHeight).toBeCloseTo(a_fit_result_data.fontSize * 1.4, 6);
    expect(a_fit_result_data.lines.length * a_fit_result_data.lineHeight).toBeLessThanOrEqual(95);
  });

  it("layoutTextToBox applies default padding and handles empty text", () => {
    const a_canvas_context_data = a_make_mock_canvas_context_data();
    const a_layout_result_data = layoutTextToBox("", a_canvas_context_data, {
      boxWidth: 300,
      boxHeight: 200,
      fontFamily: "Impact",
    });

    expect(a_layout_result_data.maxWidth).toBe(244);
    expect(a_layout_result_data.maxHeight).toBe(144);
    expect(a_layout_result_data.lines).toEqual([]);
    expect(a_layout_result_data.fontSize).toBeGreaterThanOrEqual(10);
  });
});
