import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";

import {
  EXPORT_PHOTO_CAP,
  isEmbeddablePhoto,
  type SessionExportModel,
} from "@/lib/session-export";

/** A photo's raw bytes + mime, fetched (Phase-4 gated) by the route. */
export type ExportPhotoData = {
  bytes: Uint8Array;
  mime_type: string | null;
};

const PAGE = { w: 595.28, h: 841.89 }; // A4 portrait (pt)
const MARGIN = 48;
const CONTENT_W = PAGE.w - MARGIN * 2;

/**
 * Render a session PDF (pure CPU, no I/O) from the assembled model + the
 * already-fetched photo bytes. Embeds JPEG/PNG; skips other formats (e.g.
 * HEIC) with a note. Returns the PDF bytes.
 */
export async function renderSessionPdf(
  model: SessionExportModel,
  photos: ExportPhotoData[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Pre-flight Report — ${model.tail}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - MARGIN;

  const muted = rgb(0.42, 0.45, 0.5);
  const ink = rgb(0.1, 0.12, 0.15);

  const ensure = (need: number) => {
    if (y - need < MARGIN) {
      page = doc.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - MARGIN;
    }
  };
  const wrap = (text: string, f: PDFFont, size: number): string[] => {
    const out: string[] = [];
    for (const raw of text.split(/\r?\n/)) {
      let line = "";
      for (const word of raw.split(/\s+/)) {
        const trial = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(trial, size) > CONTENT_W && line) {
          out.push(line);
          line = word;
        } else {
          line = trial;
        }
      }
      out.push(line);
    }
    return out;
  };
  const text = (
    s: string,
    { size = 11, f = font, color = ink, gap = 4 }: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number } = {},
  ) => {
    for (const line of wrap(s, f, size)) {
      ensure(size + gap);
      page.drawText(line, { x: MARGIN, y: y - size, size, font: f, color });
      y -= size + gap;
    }
  };
  const heading = (s: string) => {
    y -= 8;
    ensure(16);
    text(s, { size: 13, f: bold });
    y -= 2;
  };

  // --- Header --------------------------------------------------------
  text(`Pre-flight Report — ${model.tail}`, { size: 18, f: bold });
  text(`${model.dateLabel}  ·  ${model.statusLabel}`, { size: 11, color: muted });

  // --- Issues --------------------------------------------------------
  heading("Issues");
  if (model.issues.length === 0) {
    text("No issues logged.", { color: muted });
  } else {
    for (const i of model.issues) {
      text(`• ${i.type}`, { f: bold, gap: 2 });
      text(`${i.location}  —  ${i.severity}  —  ${i.status}`, {
        size: 10,
        color: muted,
        gap: 6,
      });
    }
  }

  // --- Notes / transcripts -------------------------------------------
  heading("Notes & voice transcripts");
  if (model.notes.length === 0) {
    text("No notes or transcripts.", { color: muted });
  } else {
    for (const n of model.notes) text(`• ${n}`, { gap: 3 });
  }

  // --- Photos --------------------------------------------------------
  heading("Photos");
  if (model.photos.length === 0) {
    text("No photos attached.", { color: muted });
  } else {
    let embedded = 0;
    for (let idx = 0; idx < photos.length && embedded < EXPORT_PHOTO_CAP; idx++) {
      const p = photos[idx];
      const kind = isEmbeddablePhoto(p.mime_type);
      if (!kind) {
        text("• [photo not embeddable in PDF (unsupported format)]", {
          size: 10,
          color: muted,
        });
        continue;
      }
      let img: PDFImage;
      try {
        img = kind === "jpg" ? await doc.embedJpg(p.bytes) : await doc.embedPng(p.bytes);
      } catch {
        text("• [photo could not be embedded]", { size: 10, color: muted });
        continue;
      }
      const scale = Math.min(1, CONTENT_W / img.width);
      const w = img.width * scale;
      const h = img.height * scale;
      ensure(h + 10);
      page.drawImage(img, { x: MARGIN, y: y - h, width: w, height: h });
      y -= h + 12;
      embedded++;
    }
    const remaining = model.photos.length - embedded;
    if (remaining > 0) {
      text(`… ${remaining} more photo${remaining === 1 ? "" : "s"} not shown.`, {
        size: 10,
        color: muted,
      });
    }
  }

  // --- Footer --------------------------------------------------------
  y -= 10;
  text(`Generated ${model.generatedAtLabel} · FlightRecall`, {
    size: 9,
    color: muted,
  });

  return doc.save();
}
