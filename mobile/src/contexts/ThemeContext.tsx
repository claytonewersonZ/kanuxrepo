import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWeather, WeatherData, getWeatherColors } from '../lib/weather';

// ── Tipos ────────────────────────────────────────────────────────────────────

export type AppThemeMode = 'auto' | 'light' | 'dark';

export interface AppThemeColors {
  background: string;
  backgroundLight: string;
  surface: string;
  surfaceLight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  divider: string;
}

const DARK_COLORS: AppThemeColors = {
  background: '#1E1F22',
  backgroundLight: '#2B2D31',
  surface: '#313338',
  surfaceLight: '#383A40',
  text: '#F2F3F5',
  textSecondary: '#B5BAC1',
  textMuted: '#80848E',
  border: '#3F4147',
  divider: '#35373C',
};

const LIGHT_COLORS: AppThemeColors = {
  background: '#F5F5F7',
  backgroundLight: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceLight: '#F0F0F5',
  text: '#1A1A1E',
  textSecondary: '#4A4A55',
  textMuted: '#8A8A99',
  border: '#D8D8E0',
  divider: '#E5E5EA',
};

interface ThemeContextType {
  themeMode: AppThemeMode;
  setThemeMode: (mode: AppThemeMode) => void;
  lastManualMode: Exclude<AppThemeMode, 'auto'>;
  themeColors: AppThemeColors;
  isDark: boolean;
  weather: WeatherData | null;
  weatherLoading: boolean;
  refreshWeather: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = '@kanux_theme_mode';
const LAST_MANUAL_STORAGE_KEY = '@kanux_last_manual_theme_mode';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<AppThemeMode>('auto');
  const [lastManualMode, setLastManualMode] = useState<Exclude<AppThemeMode, 'auto'>>('dark');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);

  // Load persisted theme preference
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === 'auto' || val === 'light' || val === 'dark') {
        setThemeModeState(val);
      }
    }).catch(() => {});

    AsyncStorage.getItem(LAST_MANUAL_STORAGE_KEY).then((val) => {
      if (val === 'light' || val === 'dark') {
        setLastManualMode(val);
      }
    }).catch(() => {});
  }, []);

  const loadWeather = useCallback(async () => {
    setWeatherLoading(true);
    try {
      const data = await fetchWeather();
      setWeather(data);
    } catch {
      // keep null
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeather();
  }, [loadWeather]);

  const setThemeMode = useCallback((mode: AppThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});

    if (mode === 'light' || mode === 'dark') {
      setLastManualMode(mode);
      AsyncStorage.setItem(LAST_MANUAL_STORAGE_KEY, mode).catch(() => {});
    }
  }, []);

  // Determine if dark based on mode
  const isDark: boolean = (() => {
    if (themeMode === 'dark') return true;
    if (themeMode === 'light') return false;
    // auto: dark if night or stormy/rainy weather
    if (!weather) return true; // default dark
    const nightConditions: string[] = ['night_clear', 'night_cloudy', 'night_rainy', 'night_stormy', 'stormy', 'rainy'];
    return nightConditions.includes(weather.condition);
  })();

  const themeColors: AppThemeColors = isDark ? DARK_COLORS : LIGHT_COLORS;

  return (
    <ThemeContext.Provider value={{
      themeMode,
      setThemeMode,
      lastManualMode,
      themeColors,
      isDark,
      weather,
      weatherLoading,
      refreshWeather: loadWeather,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  return ctx;
}

export { getWeatherColors };
