const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

function inlineMarkdown(value) {
  const links = [];
  let text = String(value || "").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    const index = links.push({ label, url }) - 1;
    return `@@RADAR_LINK_${index}@@`;
  });
  text = escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  return text.replace(/@@RADAR_LINK_(\d+)@@/g, (_, index) => {
    const link = links[Number(index)];
    return `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`;
  });
}

export function renderChatMarkdown(value = "") {
  const lines = String(value).replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let listType = "";
  const closeList = () => { if (listType) output.push(`</${listType}>`); listType = ""; };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { closeList(); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(4, heading[1].length + 2);
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || ordered) {
      const wanted = bullet ? "ul" : "ol";
      if (listType !== wanted) { closeList(); output.push(`<${wanted}>`); listType = wanted; }
      output.push(`<li>${inlineMarkdown((bullet || ordered)[1])}</li>`);
      continue;
    }
    closeList();
    output.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeList();
  return output.join("");
}
