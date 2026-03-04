import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { renderThumbnail } from "@/lib/thumbnail_renderer";

type a_window_thumbnail_renderer_shape_data = Window & {
  __thumbnail_renderer_data?: {
    renderThumbnail: typeof renderThumbnail;
  };
};

const a_global_window_reference_data = window as a_window_thumbnail_renderer_shape_data;
a_global_window_reference_data.__thumbnail_renderer_data = {
  renderThumbnail,
};

createRoot(document.getElementById("root")!).render(<App />);
