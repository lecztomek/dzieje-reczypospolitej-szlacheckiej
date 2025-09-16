import { useState } from 'react';
import './App.css';

const PROVINCES = {
  P: {
    id: 'P',
    name: 'Prusy Królewskie',
    short: 'Prusy',
    mission: 'Prusach',
    tagline: 'Portowe okno Rzeczypospolitej',
    description:
      'Kupieckie miasta nad Bałtykiem dostarczają skarbom Korony srebra i przypraw. Kontroluj szlaki wiślane, aby zapewnić swojej frakcji stabilny dopływ funduszy.',
    facts: [
      'Miasta-klucze: Gdańsk, Elbląg, Toruń',
      'Premia startowa: +2 do handlu morskiego',
      'Wyzwanie: utrzymaj lojalność mieszczaństwa',
    ],
    fill: '#161616',
    highlight: '#2c2c2c',
  },
  W: {
    id: 'W',
    name: 'Wielkopolska',
    short: 'Wielkopolska',
    mission: 'Wielkopolsce',
    tagline: 'Strażniczka zachodnich granic',
    description:
      'Sejmiki szlacheckie i folwarki zapewniają zaplecze rekrutacyjne. Rozwijaj gospodarstwa oraz utrzymuj równowagę pomiędzy magnaterią a królem.',
    facts: [
      'Centra: Poznań, Kalisz, Warta',
      'Premia startowa: +1 do produkcji zboża',
      'Wyzwanie: lawiruj między interesami możnych rodów',
    ],
    fill: '#222222',
    highlight: '#3a3a3a',
  },
  M: {
    id: 'M',
    name: 'Małopolska',
    short: 'Małopolska',
    mission: 'Małopolsce',
    tagline: 'Królewskie serce Korony',
    description:
      'Kraków, wielickie żupy i sieć zamków królewskich stanowią zaplecze polityczne i logistyczne. Zadbaj o skarbiec oraz o obronę południowych szlaków.',
    facts: [
      'Centra: Kraków, Lwów, Sandomierz',
      'Premia startowa: +1 do skarbu królewskiego',
      'Wyzwanie: odeprzyj najazdy od strony Karpat',
    ],
    fill: '#303030',
    highlight: '#4a4a4a',
  },
  L: {
    id: 'L',
    name: 'Wielkie Księstwo Litewskie',
    short: 'Litwa',
    mission: 'Litwie',
    tagline: 'Tarcza unii lubelskiej',
    description:
      'Rozległe ziemie od Żmudzi po Polesie wymagają mobilnej armii i wiernych bojarów. Wywalcz przewagę kawalerią i utrzymaj granicę z Moskwą.',
    facts: [
      'Centra: Wilno, Kowno, Mińsk',
      'Premia startowa: +2 do jazdy litewskiej',
      'Wyzwanie: powstrzymaj ekspansję moskiewską',
    ],
    fill: '#464646',
    highlight: '#616161',
  },
  U: {
    id: 'U',
    name: 'Ukraina',
    short: 'Ukraina',
    mission: 'Ukrainie',
    tagline: 'Dziki step i kozackie chorągwie',
    description:
      'Kresy południowo-wschodnie dają dostęp do kozackich sojuszników, ale wymagają stałej czujności wobec najazdów tatarskich i buntów.',
    facts: [
      'Centra: Kijów, Bracław, Czernihów',
      'Premia startowa: Kozacy jako oddziały specjalne',
      'Wyzwanie: ujarzmij powstania i rajdy ordy',
    ],
    fill: '#5c5c5c',
    highlight: '#767676',
  },
};

const MAP_ROWS = [
  '..PPLLLLLLLLL....',
  '...PPPLLLLLLLLL..',
  '..PPPPWWWLLLLLL..',
  '.PPPPWWWWLLLLL...',
  '..PPWWWWMMMMLL...',
  '....WWWMMMMMLL...',
  '.....WWMMMMLLUU..',
  '......WMMMMLLUUU.',
  '.......MMMMLLUUUU',
  '........MMMLUUUUU',
  '.........MMLUUUUU',
  '..........MLUUUU.',
];

const MAP_COLUMNS = MAP_ROWS[0].length;
const PROVINCE_LIST = Object.values(PROVINCES);

function App() {
  const [selectedProvince, setSelectedProvince] = useState('M');
  const activeProvince = PROVINCES[selectedProvince];

  const handleSelect = (symbol) => {
    if (selectedProvince !== symbol) {
      setSelectedProvince(symbol);
    }
  };

  return (
    <div className="page">
      <header className="header">
        <div className="header__frame">
          <p className="header__eyebrow">Rzeczpospolita Obojga Narodów · 1650</p>
          <h1 className="header__title">Mapa kampanii</h1>
          <p className="header__subtitle">
            Schematyczna mapa w stylistyce pixelart przygotowuje Cię do startu przeglądarkowej kampanii.
            Wybierz prowincję, by poznać jej atuty strategiczne i rozpocząć misję.
          </p>
        </div>
      </header>

      <main className="main">
        <section className="map-section" aria-labelledby="map-heading">
          <div className="map-shell">
            <div className="map-shell__header">
              <h2 id="map-heading" className="map-shell__title">
                Interaktywna mapa prowincji (1650)
              </h2>
              <p className="map-shell__hint">Najedź lub kliknij obszar, aby aktywować prowincję.</p>
            </div>

            <div
              className="map-grid"
              role="group"
              aria-label="Mapa Rzeczypospolitej podzielonej na prowincje: Prusy, Wielkopolska, Małopolska, Litwa i Ukraina"
              style={{ '--columns': MAP_COLUMNS }}
            >
              {MAP_ROWS.map((row, rowIndex) =>
                row.split('').map((symbol, colIndex) => {
                  const key = `${rowIndex}-${colIndex}`;

                  if (symbol === '.') {
                    return <span key={key} className="map__cell map__cell--void" aria-hidden="true" />;
                  }

                  const province = PROVINCES[symbol];
                  const isActive = symbol === selectedProvince;

                  return (
                    <button
                      key={key}
                      type="button"
                      data-province={symbol}
                      className={`map__cell map__cell--province${isActive ? ' is-active' : ''}`}
                      style={{
                        '--province-color': province.fill,
                        '--province-highlight': province.highlight,
                      }}
                      onMouseEnter={() => handleSelect(symbol)}
                      onFocus={() => handleSelect(symbol)}
                      onClick={() => handleSelect(symbol)}
                      aria-pressed={isActive}
                      aria-label={`${province.name} – rząd ${rowIndex + 1}, kolumna ${colIndex + 1}`}
                    >
                      <span className="map__cell-inner" />
                    </button>
                  );
                }),
              )}
            </div>

            <div className="map-legend" role="list">
              {PROVINCE_LIST.map((province) => (
                <div key={province.id} className="map-legend__item" role="listitem">
                  <span
                    className="map-legend__swatch"
                    style={{
                      '--province-color': province.fill,
                      '--province-highlight': province.highlight,
                    }}
                    aria-hidden="true"
                  />
                  <div className="map-legend__text">
                    <p className="map-legend__name">{province.name}</p>
                    <p className="map-legend__tagline">{province.tagline}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="panel" aria-live="polite">
            <p className="panel__eyebrow">Sektor: {activeProvince.short}</p>
            <h3 className="panel__title">{activeProvince.name}</h3>
            <p className="panel__tagline">{activeProvince.tagline}</p>
            <p className="panel__description">{activeProvince.description}</p>
            <ul className="panel__facts">
              {activeProvince.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
            <button type="button" className="panel__action">
              Rozpocznij misję w {activeProvince.mission}
            </button>
          </aside>
        </section>
      </main>

      <footer className="footer">
        <p>© {new Date().getFullYear()} Kampania Rzeczypospolitej. Strategia zaczyna się od mapy.</p>
      </footer>
    </div>
  );
}

export default App;
