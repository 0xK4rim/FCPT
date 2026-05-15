browser.runtime.onMessage.addListener(async (msg) => {
  if (!msg || msg.type !== "save-samples") {
    return;
  }

  const text = String(msg.text ?? "");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  try {
    await browser.downloads.download({
      url,
      filename: "sample-cases.txt",
      conflictAction: "overwrite",
      saveAs: false
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});
