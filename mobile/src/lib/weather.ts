// Serviço de clima usando Open-Meteo (gratuito, sem API key)
// Localização aproximada via IP (ipapi.co) — sem permissão nativa necessária

export type WeatherCondition =
  | 'sunny'       // céu limpo / ensolarado
  | 'partly_cloudy' // parcialmente nublado
  | 'cloudy'      // nublado
  | 'foggy'       // neblina
  | 'drizzle'     // garoa
  | 'rainy'       // chuva
  | 'stormy'      // tempestade
  | 'snowy'       // neve
  | 'night_clear' // noite limpa
  | 'night_cloudy'// noite nublada
  | 'night_rainy' // noite chuvosa
  | 'night_stormy'; // noite tempestade

export interface WeatherData {
  condition: WeatherCondition;
  temperature: number;
  city: string;
  description: string;
  isNight: boolean;
  lat: number;
  lon: number;
}

function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 19;
}

function wmoToCondition(code: number, isNight: boolean): { condition: WeatherCondition; description: string } {
  // WMO weather codes: https://open-meteo.com/en/docs
  if (code === 0) {
    return isNight
      ? { condition: 'night_clear', description: 'Noite estrelada' }
      : { condition: 'sunny', description: 'Ensolarado' };
  }
  if (code <= 2) {
    return isNight
      ? { condition: 'night_cloudy', description: 'Noite nublada' }
      : { condition: 'partly_cloudy', description: 'Parcialmente nublado' };
  }
  if (code === 3) {
    return isNight
      ? { condition: 'night_cloudy', description: 'Nublado' }
      : { condition: 'cloudy', description: 'Nublado' };
  }
  if (code === 45 || code === 48) {
    return { condition: 'foggy', description: 'Neblina' };
  }
  if (code >= 51 && code <= 57) {
    return isNight
      ? { condition: 'night_rainy', description: 'Garoa de Noite' }
      : { condition: 'drizzle', description: 'Garoa Leve' };
  }
  if (code >= 61 && code <= 67) {
    return isNight
      ? { condition: 'night_rainy', description: 'Chuva de Noite' }
      : { condition: 'rainy', description: code <= 63 ? 'Chuva Leve' : 'Nublado/Chuva Leve' };
  }
  if (code >= 71 && code <= 77) {
    return { condition: 'snowy', description: 'Neve' };
  }
  if (code >= 80 && code <= 82) {
    return isNight
      ? { condition: 'night_rainy', description: 'Pancadas de Chuva' }
      : { condition: 'rainy', description: 'Pancadas de Chuva' };
  }
  if (code >= 85 && code <= 86) {
    return { condition: 'snowy', description: 'Neve Intensa' };
  }
  if (code >= 95 && code <= 99) {
    return isNight
      ? { condition: 'night_stormy', description: 'Tempestade' }
      : { condition: 'stormy', description: 'Tempestade' };
  }
  return isNight
    ? { condition: 'night_cloudy', description: 'Nublado' }
    : { condition: 'cloudy', description: 'Nublado' };
}

let _cachedWeather: WeatherData | null = null;
let _cacheTime = 0;
const CACHE_TTL = 20 * 60 * 1000; // 20 minutos

export async function fetchWeather(): Promise<WeatherData> {
  const now = Date.now();
  if (_cachedWeather && now - _cacheTime < CACHE_TTL) {
    // Re-verificar se é noite agora (pode ter mudado)
    const night = isNightTime();
    if (night !== _cachedWeather.isNight) {
      const codeInfo = wmoToCondition(0, night); // fallback dummy, will be replaced
      _cachedWeather = { ..._cachedWeather, isNight: night };
    }
    return _cachedWeather;
  }

  let lat = -15.78; // default: Brasília
  let lon = -47.93;
  let city = 'Brasil';

  try {
    const geoRes = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
    if (geoRes.ok) {
      const geo = await geoRes.json();
      if (geo.latitude && geo.longitude) {
        lat = geo.latitude;
        lon = geo.longitude;
        city = geo.city || geo.region || 'Brasil';
      }
    }
  } catch {
    // fallback to default coords
  }

  const night = isNightTime();
  let temperature = 25;
  let conditionInfo: { condition: WeatherCondition; description: string } = night
    ? { condition: 'night_clear', description: 'Noite estrelada' }
    : { condition: 'sunny', description: 'Ensolarado' };

  try {
    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weathercode` +
      `&timezone=auto`;
    const wRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(8000) });
    if (wRes.ok) {
      const wData = await wRes.json();
      const curr = wData?.current;
      if (curr) {
        temperature = Math.round(curr.temperature_2m ?? 25);
        conditionInfo = wmoToCondition(curr.weathercode ?? 0, night);
      }
    }
  } catch {
    // keep defaults
  }

  const result: WeatherData = {
    condition: conditionInfo.condition,
    description: conditionInfo.description,
    temperature,
    city,
    isNight: night,
    lat,
    lon,
  };

  _cachedWeather = result;
  _cacheTime = now;
  return result;
}

/** Retorna gradiente de cores com base na condição climática */
export function getWeatherColors(condition: WeatherCondition): {
  bg: string;
  bgSecondary: string;
  textPrimary: string;
  textSecondary: string;
  cardBg: string;
  icon: string;
} {
  switch (condition) {
    case 'sunny':
      return { bg: '#1E90FF', bgSecondary: '#87CEEB', textPrimary: '#FFFFFF', textSecondary: 'rgba(255,255,255,0.85)', cardBg: 'rgba(255,255,255,0.25)', icon: '☀️' };
    case 'partly_cloudy':
      return { bg: '#4A90D9', bgSecondary: '#6BAED6', textPrimary: '#FFFFFF', textSecondary: 'rgba(255,255,255,0.85)', cardBg: 'rgba(255,255,255,0.20)', icon: '⛅' };
    case 'cloudy':
      return { bg: '#708090', bgSecondary: '#546E7A', textPrimary: '#FFFFFF', textSecondary: 'rgba(255,255,255,0.80)', cardBg: 'rgba(255,255,255,0.15)', icon: '☁️' };
    case 'foggy':
      return { bg: '#6B7280', bgSecondary: '#9CA3AF', textPrimary: '#FFFFFF', textSecondary: 'rgba(255,255,255,0.75)', cardBg: 'rgba(255,255,255,0.15)', icon: '🌫️' };
    case 'drizzle':
      return { bg: '#3B6BA5', bgSecondary: '#4A7DB0', textPrimary: '#FFFFFF', textSecondary: 'rgba(255,255,255,0.80)', cardBg: 'rgba(255,255,255,0.15)', icon: '🌦️' };
    case 'rainy':
      return { bg: '#2C3E50', bgSecondary: '#3D5166', textPrimary: '#FFFFFF', textSecondary: 'rgba(255,255,255,0.80)', cardBg: 'rgba(255,255,255,0.12)', icon: '🌧️' };
    case 'stormy':
      return { bg: '#1A1A2E', bgSecondary: '#16213E', textPrimary: '#E0E0E0', textSecondary: 'rgba(224,224,224,0.75)', cardBg: 'rgba(255,255,255,0.10)', icon: '⛈️' };
    case 'snowy':
      return { bg: '#B0C4DE', bgSecondary: '#D6E4F7', textPrimary: '#1A2A3A', textSecondary: 'rgba(26,42,58,0.75)', cardBg: 'rgba(255,255,255,0.40)', icon: '❄️' };
    case 'night_clear':
      return { bg: '#0B1120', bgSecondary: '#1C2951', textPrimary: '#E8EAED', textSecondary: 'rgba(232,234,237,0.75)', cardBg: 'rgba(255,255,255,0.08)', icon: '🌙' };
    case 'night_cloudy':
      return { bg: '#1C2331', bgSecondary: '#2C3547', textPrimary: '#D0D3D9', textSecondary: 'rgba(208,211,217,0.75)', cardBg: 'rgba(255,255,255,0.08)', icon: '🌑' };
    case 'night_rainy':
      return { bg: '#0A0F1E', bgSecondary: '#1A2540', textPrimary: '#C8CDD6', textSecondary: 'rgba(200,205,214,0.75)', cardBg: 'rgba(255,255,255,0.07)', icon: '🌧️' };
    case 'night_stormy':
      return { bg: '#080D18', bgSecondary: '#0F1830', textPrimary: '#B8BCC4', textSecondary: 'rgba(184,188,196,0.70)', cardBg: 'rgba(255,255,255,0.06)', icon: '⛈️' };
    default:
      return { bg: '#2C3E50', bgSecondary: '#3D5166', textPrimary: '#FFFFFF', textSecondary: 'rgba(255,255,255,0.80)', cardBg: 'rgba(255,255,255,0.12)', icon: '🌤️' };
  }
}

export function getWeatherGreeting(condition: WeatherCondition, name: string): { title: string; subtitle: string } {
  const hour = new Date().getHours();
  const period = hour < 12 ? 'dia' : hour < 18 ? 'tarde' : 'noite';
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  switch (condition) {
    case 'sunny':
      return { title: `Olá, ${greet},\n${name}`, subtitle: 'Dia lindo de sol! ☀️' };
    case 'partly_cloudy':
      return { title: `Olá, ${greet},\n${name}`, subtitle: 'Céu parcialmente nublado.' };
    case 'cloudy':
      return { title: `Dia nublado por aqui.\nCuide-se!`, subtitle: '' };
    case 'foggy':
      return { title: `Neblina hoje.\nDirija com cuidado!`, subtitle: '' };
    case 'drizzle':
      return { title: `Olá, ${greet},\n${name}`, subtitle: 'Garoa leve por aqui 🌦️' };
    case 'rainy':
      return { title: `Dia chuvoso hoje.\nBom guarda-chuva!`, subtitle: '' };
    case 'stormy':
      return { title: `Tempestade à vista!\nFique em segurança ⛈️`, subtitle: '' };
    case 'snowy':
      return { title: `Neve por aqui!\nQue dia especial ❄️`, subtitle: '' };
    case 'night_clear':
      return { title: `Boa noite, ${name}!`, subtitle: 'Noite estrelada 🌙' };
    case 'night_cloudy':
      return { title: `Boa noite, ${name}!`, subtitle: 'Noite nublada por aqui.' };
    case 'night_rainy':
      return { title: `Uma noite chuvosa.\nAproveite o aconchego!`, subtitle: '' };
    case 'night_stormy':
      return { title: `Noite de tempestade.\nFique seguro! ⛈️`, subtitle: '' };
    default:
      return { title: `Olá, ${greet},\n${name}`, subtitle: 'Bom ${period} para você!' };
  }
}
