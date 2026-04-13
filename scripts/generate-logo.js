/**
 * Script para gerar todos os PNG do logo Kanux
 * Baseado no design da marca: chatbot roxo/azul com headset e ferramenta
 * 
 * Uso: node scripts/generate-logo.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// SVG do logo Kanux - design inspirado na identidade visual da marca
function createLogoSVG(size, padding = 0) {
  const s = size;
  const p = padding;
  const inner = s - p * 2;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
  <defs>
    <!-- Gradiente fundo roxo -->
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7C3AED"/>
      <stop offset="50%" stop-color="#6D28D9"/>
      <stop offset="100%" stop-color="#5B21B6"/>
    </linearGradient>
    <!-- Gradiente bolha chat azul -->
    <linearGradient id="bubbleGrad" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#60A5FA"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>
    <!-- Gradiente headset -->
    <linearGradient id="headsetGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E5E7EB"/>
      <stop offset="100%" stop-color="#D1D5DB"/>
    </linearGradient>
    <!-- Sombra -->
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="${s * 0.005}" stdDeviation="${s * 0.015}" flood-color="#000" flood-opacity="0.3"/>
    </filter>
    <filter id="shadowSm" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="${s * 0.003}" stdDeviation="${s * 0.008}" flood-color="#000" flood-opacity="0.25"/>
    </filter>
  </defs>
  
  <!-- Fundo com cantos arredondados -->
  <rect x="${p}" y="${p}" width="${inner}" height="${inner}" rx="${inner * 0.22}" ry="${inner * 0.22}" fill="url(#bgGrad)"/>
  
  <!-- Brilho sutil no topo -->
  <rect x="${p}" y="${p}" width="${inner}" height="${inner * 0.5}" rx="${inner * 0.22}" ry="${inner * 0.22}" fill="white" opacity="0.06"/>
  
  <!-- Círculos decorativos de fundo -->
  <circle cx="${p + inner * 0.2}" cy="${p + inner * 0.15}" r="${inner * 0.03}" fill="white" opacity="0.08"/>
  <circle cx="${p + inner * 0.85}" cy="${p + inner * 0.65}" r="${inner * 0.02}" fill="white" opacity="0.06"/>
  <circle cx="${p + inner * 0.15}" cy="${p + inner * 0.75}" r="${inner * 0.025}" fill="white" opacity="0.05"/>
  
  <!-- Arco do headset (branco) -->
  <g filter="url(#shadow)">
    <path d="M ${p + inner * 0.25} ${p + inner * 0.48} 
             Q ${p + inner * 0.25} ${p + inner * 0.22}, ${p + inner * 0.5} ${p + inner * 0.22} 
             Q ${p + inner * 0.75} ${p + inner * 0.22}, ${p + inner * 0.75} ${p + inner * 0.48}" 
          fill="none" stroke="white" stroke-width="${inner * 0.04}" stroke-linecap="round" opacity="0.95"/>
  </g>
  
  <!-- Bolha de chat principal -->
  <g filter="url(#shadow)">
    <path d="M ${p + inner * 0.22} ${p + inner * 0.4}
             Q ${p + inner * 0.22} ${p + inner * 0.3}, ${p + inner * 0.35} ${p + inner * 0.3}
             L ${p + inner * 0.65} ${p + inner * 0.3}
             Q ${p + inner * 0.78} ${p + inner * 0.3}, ${p + inner * 0.78} ${p + inner * 0.4}
             L ${p + inner * 0.78} ${p + inner * 0.58}
             Q ${p + inner * 0.78} ${p + inner * 0.68}, ${p + inner * 0.65} ${p + inner * 0.68}
             L ${p + inner * 0.45} ${p + inner * 0.68}
             L ${p + inner * 0.35} ${p + inner * 0.77}
             L ${p + inner * 0.37} ${p + inner * 0.68}
             L ${p + inner * 0.35} ${p + inner * 0.68}
             Q ${p + inner * 0.22} ${p + inner * 0.68}, ${p + inner * 0.22} ${p + inner * 0.58}
             Z"
          fill="url(#bubbleGrad)"/>
  </g>
  
  <!-- Três pontos na bolha -->
  <circle cx="${p + inner * 0.38}" cy="${p + inner * 0.49}" r="${inner * 0.035}" fill="white"/>
  <circle cx="${p + inner * 0.50}" cy="${p + inner * 0.49}" r="${inner * 0.035}" fill="white"/>
  <circle cx="${p + inner * 0.62}" cy="${p + inner * 0.49}" r="${inner * 0.035}" fill="white"/>
  
  <!-- Fone de ouvido esquerdo -->
  <g filter="url(#shadowSm)">
    <rect x="${p + inner * 0.17}" y="${p + inner * 0.42}" width="${inner * 0.09}" height="${inner * 0.16}" rx="${inner * 0.04}" fill="#F59E0B"/>
    <rect x="${p + inner * 0.185}" y="${p + inner * 0.435}" width="${inner * 0.06}" height="${inner * 0.13}" rx="${inner * 0.03}" fill="#FBBF24"/>
  </g>
  
  <!-- Fone de ouvido direito -->
  <g filter="url(#shadowSm)">
    <rect x="${p + inner * 0.74}" y="${p + inner * 0.42}" width="${inner * 0.09}" height="${inner * 0.16}" rx="${inner * 0.04}" fill="#F59E0B"/>
    <rect x="${p + inner * 0.755}" y="${p + inner * 0.435}" width="${inner * 0.06}" height="${inner * 0.13}" rx="${inner * 0.03}" fill="#FBBF24"/>
  </g>
  
  <!-- Microfone (haste + base) -->
  <line x1="${p + inner * 0.78}" y1="${p + inner * 0.58}" x2="${p + inner * 0.82}" y2="${p + inner * 0.68}" stroke="white" stroke-width="${inner * 0.025}" stroke-linecap="round" opacity="0.9"/>
  <circle cx="${p + inner * 0.83}" cy="${p + inner * 0.70}" r="${inner * 0.03}" fill="white" opacity="0.9"/>
  
  <!-- Badge ferramenta (canto superior direito) -->
  <g filter="url(#shadowSm)">
    <circle cx="${p + inner * 0.82}" cy="${p + inner * 0.20}" r="${inner * 0.10}" fill="#F59E0B"/>
    <circle cx="${p + inner * 0.82}" cy="${p + inner * 0.20}" r="${inner * 0.085}" fill="#FBBF24"/>
  </g>
  
  <!-- Ícone de chave inglesa no badge -->
  <g transform="translate(${p + inner * 0.82}, ${p + inner * 0.20}) rotate(-45) scale(${inner * 0.001})">
    <path d="M -28 -28 C -15 -40, 15 -40, 28 -28 C 40 -15, 40 15, 28 18 L 8 -2 L -2 8 L 18 28 C 15 40, -15 40, -28 28 L -8 2 L 2 -8 Z"
          fill="white" opacity="0.95"/>
  </g>
</svg>`;
}

// SVG do splash (logo + texto "Kanux" + "Help Desk")
function createSplashSVG(width, height) {
  const logoSize = Math.min(width, height) * 0.25;
  const cx = width / 2;
  const cy = height / 2 - logoSize * 0.3;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0D0D12"/>
      <stop offset="100%" stop-color="#09090B"/>
    </linearGradient>
    <linearGradient id="iconBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7C3AED"/>
      <stop offset="50%" stop-color="#6D28D9"/>
      <stop offset="100%" stop-color="#5B21B6"/>
    </linearGradient>
    <linearGradient id="bubbleGrad" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#60A5FA"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>
    <filter id="glow">
      <feDropShadow dx="0" dy="0" stdDeviation="20" flood-color="#8B5CF6" flood-opacity="0.4"/>
    </filter>
    <filter id="shadow">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <!-- Fundo escuro -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
  
  <!-- Logo centralizado com glow -->
  <g filter="url(#glow)" transform="translate(${cx - logoSize / 2}, ${cy - logoSize / 2})">
    ${createIconGroup(logoSize)}
  </g>
  
  <!-- Texto "Kanux" -->
  <text x="${cx}" y="${cy + logoSize * 0.7}" text-anchor="middle" 
        font-family="Arial, Helvetica, sans-serif" font-size="${logoSize * 0.28}" font-weight="800" 
        fill="#FAFAFA" letter-spacing="2">Kanux</text>
  
  <!-- Subtítulo "Help Desk" -->
  <text x="${cx}" y="${cy + logoSize * 0.9}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${logoSize * 0.11}" font-weight="500"
        fill="#A78BFA" letter-spacing="4" text-transform="uppercase">HELP DESK</text>
</svg>`;
}

function createIconGroup(s) {
  return `
    <rect width="${s}" height="${s}" rx="${s * 0.22}" ry="${s * 0.22}" fill="url(#iconBg)"/>
    <rect width="${s}" height="${s * 0.5}" rx="${s * 0.22}" ry="${s * 0.22}" fill="white" opacity="0.06"/>
    
    <!-- Arco headset -->
    <path d="M ${s * 0.25} ${s * 0.48} Q ${s * 0.25} ${s * 0.22}, ${s * 0.5} ${s * 0.22} Q ${s * 0.75} ${s * 0.22}, ${s * 0.75} ${s * 0.48}" 
          fill="none" stroke="white" stroke-width="${s * 0.04}" stroke-linecap="round" opacity="0.95"/>
    
    <!-- Bolha chat -->
    <path d="M ${s * 0.22} ${s * 0.4} Q ${s * 0.22} ${s * 0.3}, ${s * 0.35} ${s * 0.3} L ${s * 0.65} ${s * 0.3} Q ${s * 0.78} ${s * 0.3}, ${s * 0.78} ${s * 0.4} L ${s * 0.78} ${s * 0.58} Q ${s * 0.78} ${s * 0.68}, ${s * 0.65} ${s * 0.68} L ${s * 0.45} ${s * 0.68} L ${s * 0.35} ${s * 0.77} L ${s * 0.37} ${s * 0.68} L ${s * 0.35} ${s * 0.68} Q ${s * 0.22} ${s * 0.68}, ${s * 0.22} ${s * 0.58} Z"
          fill="url(#bubbleGrad)"/>
    
    <!-- Pontos -->
    <circle cx="${s * 0.38}" cy="${s * 0.49}" r="${s * 0.035}" fill="white"/>
    <circle cx="${s * 0.50}" cy="${s * 0.49}" r="${s * 0.035}" fill="white"/>
    <circle cx="${s * 0.62}" cy="${s * 0.49}" r="${s * 0.035}" fill="white"/>
    
    <!-- Fones -->
    <rect x="${s * 0.17}" y="${s * 0.42}" width="${s * 0.09}" height="${s * 0.16}" rx="${s * 0.04}" fill="#F59E0B"/>
    <rect x="${s * 0.185}" y="${s * 0.435}" width="${s * 0.06}" height="${s * 0.13}" rx="${s * 0.03}" fill="#FBBF24"/>
    <rect x="${s * 0.74}" y="${s * 0.42}" width="${s * 0.09}" height="${s * 0.16}" rx="${s * 0.04}" fill="#F59E0B"/>
    <rect x="${s * 0.755}" y="${s * 0.435}" width="${s * 0.06}" height="${s * 0.13}" rx="${s * 0.03}" fill="#FBBF24"/>
    
    <!-- Mic -->
    <line x1="${s * 0.78}" y1="${s * 0.58}" x2="${s * 0.82}" y2="${s * 0.68}" stroke="white" stroke-width="${s * 0.025}" stroke-linecap="round" opacity="0.9"/>
    <circle cx="${s * 0.83}" cy="${s * 0.70}" r="${s * 0.03}" fill="white" opacity="0.9"/>
    
    <!-- Badge ferramenta -->
    <circle cx="${s * 0.82}" cy="${s * 0.20}" r="${s * 0.10}" fill="#F59E0B"/>
    <circle cx="${s * 0.82}" cy="${s * 0.20}" r="${s * 0.085}" fill="#FBBF24"/>
    <g transform="translate(${s * 0.82}, ${s * 0.20}) rotate(-45) scale(${s * 0.001})">
      <path d="M -28 -28 C -15 -40, 15 -40, 28 -28 C 40 -15, 40 15, 28 18 L 8 -2 L -2 8 L 18 28 C 15 40, -15 40, -28 28 L -8 2 L 2 -8 Z" fill="white" opacity="0.95"/>
    </g>
  `;
}

async function generateAll() {
  const root = path.join(__dirname, '..');
  
  // Definição de todos os arquivos a gerar
  const outputs = [
    // Mobile assets
    { path: 'mobile/assets/icon.png',          type: 'icon', size: 1024 },
    { path: 'mobile/assets/adaptive-icon.png',  type: 'icon', size: 1024, padding: 100 },
    { path: 'mobile/assets/splash-icon.png',    type: 'icon', size: 300 },
    { path: 'mobile/assets/favicon.png',        type: 'icon', size: 48 },
    
    // iOS assets
    { path: 'mobile/ios/Kanux/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png', type: 'icon', size: 1024 },
    { path: 'mobile/ios/Kanux/Images.xcassets/SplashScreenLegacy.imageset/image.png',    type: 'splash', width: 414, height: 736 },
    { path: 'mobile/ios/Kanux/Images.xcassets/SplashScreenLegacy.imageset/image@2x.png', type: 'splash', width: 828, height: 1472 },
    { path: 'mobile/ios/Kanux/Images.xcassets/SplashScreenLegacy.imageset/image@3x.png', type: 'splash', width: 1242, height: 2208 },
    
    // Web PWA icons
    { path: 'web/public/icon-192.png', type: 'icon', size: 192 },
    { path: 'web/public/icon-512.png', type: 'icon', size: 512 },
  ];

  console.log('🎨 Gerando logo Kanux para todas as plataformas...\n');

  for (const out of outputs) {
    const fullPath = path.join(root, out.path);
    
    try {
      let svg;
      if (out.type === 'icon') {
        svg = createLogoSVG(out.size, out.padding || 0);
      } else {
        svg = createSplashSVG(out.width, out.height);
      }
      
      await sharp(Buffer.from(svg))
        .png()
        .toFile(fullPath);
      
      const stats = fs.statSync(fullPath);
      const sizeLabel = out.type === 'icon' ? `${out.size}x${out.size}` : `${out.width}x${out.height}`;
      console.log(`  ✅ ${out.path} (${sizeLabel}, ${(stats.size / 1024).toFixed(1)}KB)`);
    } catch (err) {
      console.error(`  ❌ ${out.path}: ${err.message}`);
    }
  }
  
  console.log('\n✨ Logo gerado com sucesso para todas as plataformas!');
  console.log('   Mobile: assets/ (icon, adaptive-icon, splash-icon, favicon)');
  console.log('   iOS: Images.xcassets/ (AppIcon, SplashScreen 1x/2x/3x)');
  console.log('   Web: public/ (icon-192, icon-512)');
}

generateAll().catch(console.error);
