export function formatCurrency(amount) {
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(num);
}

export function formatDate(dateString) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function formatTime(dateTimeString) {
  if (!dateTimeString) return '-';
  const d = new Date(dateTimeString);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDateTime(dateTimeString) {
  if (!dateTimeString) return '-';
  const d = new Date(dateTimeString);
  return `${formatDate(d)} at ${formatTime(d)}`;
}

export function parseDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return new Date();
  const trimmed = timeStr.trim();
  
  let hours = 0;
  let minutes = 0;

  // If time string contains "to", extract start time part
  let startPart = trimmed;
  if (/\s+to\s+/i.test(trimmed)) {
    startPart = trimmed.split(/\s+to\s+/i)[0].trim();
  }

  if (/^\d{1,2}$/.test(startPart)) {
    let startH = parseInt(startPart, 10);
    if (startH >= 1 && startH <= 11) {
      startH += 12;
    } else if (startH === 12) {
      startH = 12;
    }
    hours = startH;
    minutes = 0;
  } else if (startPart.includes(' ')) {
    const [time, meridian] = startPart.split(/\s+/);
    const [hoursStr, minutesStr] = time.split(':');
    hours = parseInt(hoursStr || '0', 10);
    minutes = parseInt(minutesStr || '0', 10);
    const med = (meridian || '').toUpperCase();
    if (med === 'PM' && hours < 12) {
      hours += 12;
    } else if (med === 'AM' && hours === 12) {
      hours = 0;
    }
  } else {
    const [hoursStr, minutesStr] = startPart.split(':');
    hours = parseInt(hoursStr || '0', 10);
    minutes = parseInt(minutesStr || '0', 10);
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

// Format time string part e.g. "08:00 PM" -> "8 PM", "08:30 PM" -> "8:30 PM"
export function formatTimePart(timeStr) {
  if (!timeStr) return '';
  const trimmed = timeStr.trim();
  const m = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (m) {
    const hours = parseInt(m[1], 10);
    const mins = m[2] || '00';
    const ampm = m[3].toUpperCase();
    if (mins === '00') {
      return `${hours} ${ampm}`;
    }
    return `${hours}:${mins} ${ampm}`;
  }
  return trimmed;
}

// Format booking slot message e.g. "Booked Between 8 PM and 10 PM" or "Booked Between 8 PM and 9 PM"
export function formatBookedBetween(bookingTime) {
  if (!bookingTime) return 'Booked';
  const trimmed = bookingTime.trim();
  if (/\s+to\s+/i.test(trimmed)) {
    const parts = trimmed.split(/\s+to\s+/i);
    const start = formatTimePart(parts[0]);
    const end = formatTimePart(parts[1]);
    return `Booked Between ${start} and ${end}`;
  }
  return `Booked at ${formatTimePart(trimmed)}`;
}

/**
 * Resolves an image URL so that only images actually stored in/retrieved
 * from the AWS S3 bucket are returned.
 * Rejects placeholder, dummy (such as Unsplash), and locally stored images.
 * Does not force compressed/ or square ratios; preserves original dimensions and size.
 */
export function getS3ImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // Reject Unsplash, placeholders, and dummy images
  if (
    trimmed.includes('unsplash.com') ||
    trimmed.includes('placeholder') ||
    trimmed.includes('dummy') ||
    trimmed.includes('via.placeholder.com')
  ) {
    return '';
  }

  // Data URLs (e.g. freshly selected file for preview in manager)
  if (trimmed.startsWith('data:image')) {
    return trimmed;
  }

  // Direct AWS S3 URLs
  if (trimmed.includes('.amazonaws.com/')) {
    return trimmed;
  }

  // Relative URLs hosted by our secure AWS S3 retrieval router (/uploads/*)
  let clean = trimmed.replace(/^\/+/, '');
  if (clean.startsWith('uploads/')) {
    clean = clean.replace(/^uploads\//, '');
  } else if (clean.startsWith('dishes/')) {
    clean = clean.replace(/^dishes\//, '');
  }

  if (!clean) return '';
  return `/uploads/${clean}`;
}

export function isS3ImageUrl(url) {
  return Boolean(getS3ImageUrl(url));
}

// Backward compatibility alias: forwards directly to getS3ImageUrl
export const getCompressedImageUrl = getS3ImageUrl;


