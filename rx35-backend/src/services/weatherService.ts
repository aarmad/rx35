// Service météo — Open-Meteo, gratuit et sans clé API, suffisant pour les
// prévisions à 5 jours utilisées par l'écran Accueil de l'application.
export interface WeatherDay {
  date: string;
  tempMinC: number;
  tempMaxC: number;
  pluieMm: number;
  pluiePrevue: boolean;
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherDay[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=5`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Service météo indisponible (HTTP ${res.status})`);
  }
  const data = (await res.json()) as {
    daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[] };
  };

  return data.daily.time.map((date, i) => ({
    date,
    tempMinC: data.daily.temperature_2m_min[i],
    tempMaxC: data.daily.temperature_2m_max[i],
    pluieMm: data.daily.precipitation_sum[i],
    pluiePrevue: data.daily.precipitation_sum[i] > 2,
  }));
}
