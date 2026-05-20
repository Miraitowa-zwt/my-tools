export function platformHtml(html, platform) {
  const body = String(html || "").trim();
  if (platform === "wechat") {
    return `<section style="font-size:16px;line-height:1.75;color:#222;">${body}</section>`;
  }
  if (platform === "zhihu") {
    return `<article>${body}</article>`;
  }
  return body;
}
