const fs = require('fs');
const path = require('path');

// Minimal valid 192x192 and 512x512 PNG creator (or SVG fallback)
const iconsDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Crisp SVG Brand Icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="128" fill="#0f172a" />
  <rect x="32" y="32" width="448" height="448" rx="104" fill="none" stroke="url(#grad)" stroke-width="8" opacity="0.6" />
  
  <!-- Central QR Shield / Bank Note Icon -->
  <g transform="translate(106, 106)">
    <!-- QR Corner Top-Left -->
    <rect x="0" y="0" width="90" height="90" rx="16" fill="url(#grad)" />
    <rect x="18" y="18" width="54" height="54" rx="8" fill="#0f172a" />
    <rect x="34" y="34" width="22" height="22" rx="4" fill="url(#glow)" />

    <!-- QR Corner Top-Right -->
    <rect x="210" y="0" width="90" height="90" rx="16" fill="url(#grad)" />
    <rect x="228" y="18" width="54" height="54" rx="8" fill="#0f172a" />
    <rect x="244" y="34" width="22" height="22" rx="4" fill="url(#glow)" />

    <!-- QR Corner Bottom-Left -->
    <rect x="0" y="210" width="90" height="90" rx="16" fill="url(#grad)" />
    <rect x="18" y="228" width="54" height="54" rx="8" fill="#0f172a" />
    <rect x="34" y="244" width="22" height="22" rx="4" fill="url(#glow)" />

    <!-- Center Offline Lightning / Rupee / Dollar Bolt -->
    <path d="M160,110 L120,180 L155,180 L140,250 L195,170 L155,170 Z" fill="#ffffff" />
    
    <!-- Pulse wave for offline signal -->
    <circle cx="255" cy="255" r="28" fill="url(#grad)" />
    <path d="M245 255 L252 262 L266 248" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
  </g>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent);

// Also generate minimal 1x1 or valid PNG files so manifest.json doesn't 404
// Base64 of a 192x192 green themed PNG icon
const png192Base64 = 'iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAMAAAB/Pny7AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAzUExURQAAAICAgMDAwP///+vr69ra2s7OzsLCwsbGxsnJyc3NzcbGxtbW1tzc3Nra2tra2tra2tr/AP+XbXAAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA7SURBVHja7cEBDQAAAMKg909tDwcUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4Fs1QAAByM8K3wAAAABJRU5ErkJggg==';

const buffer = Buffer.from(png192Base64, 'base64');
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), buffer);
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), buffer);

console.log('✅ Icons created in public/icons/');
