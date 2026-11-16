import { describe, expect, it } from "vitest";
import { beginUpload, getUploads, dismissUpload } from "@/lib/upload-progress";

// Die Upload-Anzeige zeigt nur Fortschritt: ein fehlgeschlagener Auftrag
// verlaesst sie sofort (den Fehler zeigt das Feld), ein fertiger bleibt
// stehen, bis die Karte ihn nach zehn Sekunden ausblendet.
describe("upload-progress", () => {
  const file = () => new File(["x".repeat(10)], "notiz.txt", { type: "text/plain" });

  it("nimmt fehlgeschlagene Uploads sofort aus der Anzeige", () => {
    const job = beginUpload(file());
    expect(getUploads()).toHaveLength(1);
    job.setPercent(40);
    job.fail();
    expect(getUploads()).toHaveLength(0);
  });

  it("laesst fertige Uploads stehen, bis sie ausgeblendet werden", () => {
    const job = beginUpload(file());
    job.done();
    const [done] = getUploads();
    expect(done.phase).toBe("done");
    expect(done.percent).toBe(100);
    dismissUpload(done.id);
    expect(getUploads()).toHaveLength(0);
  });
});
