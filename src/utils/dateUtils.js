/**
 * Format ISO date string to human-readable format
 * @param {string} isoDateString - ISO date string like "2025-10-20T04:23:52.636Z"
 * @returns {string} Formatted date string
 */
export const formatDate = (isoDateString) => {
  if (!isoDateString) return "";

  const date = new Date(isoDateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // For recent dates (within 7 days), show relative format
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes === 0 ? "Just now" : `${diffMinutes}m ago`;
    }
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  // For older dates, show readable date format
  const options = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  return date.toLocaleDateString("en-US", options);
};
