import './App.css';

const highlights = [
  {
    title: 'Złota wolność',
    description:
      'Unikalny system polityczny oparty na szerokich prawach szlachty i wolnej elekcji władcy.',
  },
  {
    title: 'Różnorodność kulturowa',
    description:
      'Mozaika narodów, języków i wyznań, które współtworzyły Rzeczpospolitą Obojga Narodów.',
  },
  {
    title: 'Dziedzictwo prawne',
    description:
      'Konstytucja 3 maja i inne reformy jako fundamenty nowoczesnej myśli politycznej w Europie.',
  },
];

const timeline = [
  {
    period: 'XVI wiek',
    event: 'Unia lubelska (1569) scala Królestwo Polskie i Wielkie Księstwo Litewskie.',
  },
  {
    period: 'XVII wiek',
    event: 'Potop szwedzki i wojny kozackie wystawiają państwo na ciężką próbę.',
  },
  {
    period: 'XVIII wiek',
    event: 'Epoka wielkich reform i uchwalenie Konstytucji 3 maja (1791).',
  },
];

function App() {
  return (
    <div className="app">
      <header className="hero">
        <div className="hero__overlay" />
        <div className="hero__content">
          <p className="hero__eyebrow">Historia do odkrycia</p>
          <h1 className="hero__title">Dzieje Rzeczypospolitej Szlacheckiej</h1>
          <p className="hero__subtitle">
            Zanurz się w fascynującą opowieść o państwie, które przez stulecia łączyło
            kultury, tradycje i ambicje swoich obywateli.
          </p>
          <div className="hero__actions">
            <a className="button button--primary" href="#poznaj">
              Poznaj historię
            </a>
            <a className="button button--secondary" href="#kalendarium">
              Kalendarium wydarzeń
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="section" id="poznaj">
          <h2 className="section__title">Dlaczego warto poznać tę historię?</h2>
          <p className="section__lead">
            Dziedzictwo Rzeczypospolitej Szlacheckiej to coś więcej niż daty i bitwy. To
            opowieść o wolności, odpowiedzialności i wspólnocie tworzonej przez różnorodne
            narody.
          </p>
          <div className="grid">
            {highlights.map((item) => (
              <article key={item.title} className="card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section section--accent" id="kalendarium">
          <h2 className="section__title">Kalendarium kluczowych momentów</h2>
          <div className="timeline">
            {timeline.map((entry) => (
              <div key={entry.period} className="timeline__entry">
                <div className="timeline__dot" aria-hidden="true" />
                <div className="timeline__content">
                  <h3>{entry.period}</h3>
                  <p>{entry.event}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section section--cta">
          <h2>Gotowy na podróż w czasie?</h2>
          <p>
            Dołącz do nas i odkryj, jak dziedzictwo Rzeczypospolitej Szlacheckiej wpływa na
            współczesność.
          </p>
          <a className="button button--primary" href="mailto:kontakt@historia.pl">
            Skontaktuj się z nami
          </a>
        </section>
      </main>

      <footer className="footer">
        <p>© {new Date().getFullYear()} Historia Rzeczypospolitej. Wszystkie prawa zastrzeżone.</p>
      </footer>
    </div>
  );
}

export default App;
