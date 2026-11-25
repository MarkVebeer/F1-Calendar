// One stroke family for every icon: 24px grid, 1.75 stroke, round joins, currentColor.

function Icon({ children, size = 20, label, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const SearchIcon = (p) => <Icon {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Icon>
export const CloseIcon = (p) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>
export const SunIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></Icon>
export const MoonIcon = (p) => <Icon {...p}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" /></Icon>
export const SettingsIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Icon>
)
export const ChevronIcon = (p) => <Icon {...p}><path d="m9 6 6 6-6 6" /></Icon>
export const ClockIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>

// Weather glyphs, chosen from Meteoblue's daily pictocode.
const Cloud = () => <path d="M7.5 18.5h9a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 12 3.25 3.25 0 0 0 7.5 18.5Z" />
const WEATHER = {
  clear: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1.5M12 19.5V21M5.6 5.6l1 1M17.4 17.4l1 1M3 12h1.5M19.5 12H21M5.6 18.4l1-1M17.4 6.6l1-1" />
    </>
  ),
  partly: (
    <>
      <path d="M9 4.5v1M4.2 9H3.2M5.6 5.6l.7.7M12.4 5.6l-.7.7" />
      <path d="M6.2 11.3a3.5 3.5 0 0 1 6.3-2.6" />
      <path d="M9.5 19.5h7.5a3.5 3.5 0 0 0 .4-6.98A4.75 4.75 0 0 0 8.4 14a2.75 2.75 0 0 0 1.1 5.5Z" />
    </>
  ),
  cloud: <Cloud />,
  fog: <path d="M4 9h16M6 13h12M4 17h16" />,
  rain: (
    <>
      <path d="M7.5 15.5h9a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 9 3.25 3.25 0 0 0 7.5 15.5Z" />
      <path d="M9 18.5 8 21M13 18.5 12 21M17 18.5 16 21" />
    </>
  ),
  storm: (
    <>
      <path d="M7.5 15.5h9a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 9 3.25 3.25 0 0 0 7.5 15.5Z" />
      <path d="m12.5 15.5-2 3h3l-2 3" />
    </>
  ),
  snow: (
    <>
      <path d="M7.5 15.5h9a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 9 3.25 3.25 0 0 0 7.5 15.5Z" />
      <path d="M9 19h.01M12 20.5h.01M15 19h.01" />
    </>
  )
}

const PICTOCODES = {
  1: ['clear', 'Clear'],
  2: ['partly', 'Mostly sunny'],
  3: ['partly', 'Partly cloudy'],
  4: ['cloud', 'Overcast'],
  5: ['fog', 'Fog'],
  6: ['rain', 'Rain'],
  7: ['rain', 'Showers'],
  8: ['storm', 'Thunderstorms'],
  9: ['snow', 'Snow'],
  10: ['snow', 'Snow showers'],
  11: ['rain', 'Rain and snow'],
  12: ['rain', 'Light rain'],
  13: ['snow', 'Light snow'],
  14: ['rain', 'Rain'],
  15: ['snow', 'Snow'],
  16: ['rain', 'Light rain'],
  17: ['snow', 'Light snow']
}

export function describeWeather(pictocode) {
  const [kind, label] = PICTOCODES[pictocode] || ['cloud', 'Cloudy']
  return { kind, label }
}

export function WeatherIcon({ pictocode, size = 20 }) {
  const { kind, label } = describeWeather(pictocode)
  return <Icon size={size} label={label}>{WEATHER[kind]}</Icon>
}
