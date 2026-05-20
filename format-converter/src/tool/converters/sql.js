export function formatSql(content) {
  return String(content || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(select|insert|update|delete|create|drop|alter|with|from|where|group by|order by|having|limit|join|left join|right join|inner join|values|set)\b/gi, (match) => `\n${match.toUpperCase()}`)
    .replace(/^\n/, "")
    .trim();
}
