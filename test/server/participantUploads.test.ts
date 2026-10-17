import { describe, expect, it } from "vitest";
import { buildParticipantUploadKey, getParticipantUploadValidationError, participantUploadPolicy } from "@server/participantUploads";
import { isAllowedUploadType, safeFileName } from "@shared/engagement";

describe("participant assignment upload policy", () => {
  it("accepts the documented file formats within the private upload size limit", () => {
    expect(getParticipantUploadValidationError({ mimetype: "application/pdf", size: participantUploadPolicy.maxBytes })).toBeNull();
    expect(getParticipantUploadValidationError({ mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1024 })).toBeNull();
  });

  it("rejects unsupported formats and oversize files before storage", () => {
    expect(getParticipantUploadValidationError({ mimetype: "application/zip", size: 1024 })).toMatch(/PDF, image, Word, Excel, or plain-text/i);
    expect(getParticipantUploadValidationError({ mimetype: "text/html", size: 1024 })).toMatch(/PDF, image, Word, Excel, or plain-text/i);
    expect(getParticipantUploadValidationError({ mimetype: "image/svg+xml", size: 1024 })).toMatch(/PDF, image, Word, Excel, or plain-text/i);
    expect(getParticipantUploadValidationError({ mimetype: "application/pdf", size: participantUploadPolicy.maxBytes + 1 })).toMatch(/15 MB/i);
  });

  it("scopes each stored object to the authenticated participant and sanitises the supplied filename", () => {
    expect(buildParticipantUploadKey(600001, "My brief (final).pdf", 1724112000000)).toBe(
      "participant-assignments/600001/1724112000000-My-brief-final-.pdf",
    );
  });

  it("blocks active HTML and SVG content and strips path components from engagement filenames", () => {
    expect(isAllowedUploadType("text/html", "invoice.html")).toBe(false);
    expect(isAllowedUploadType("image/svg+xml", "diagram.svg")).toBe(false);
    expect(safeFileName("../../<script>.svg")).toBe("script-.svg");
  });
});
