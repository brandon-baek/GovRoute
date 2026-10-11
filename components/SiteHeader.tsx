import Link from "next/link";

export function SiteHeader() {
  return (
      <header className="site-header">
        <div className="shell site-header__inner">
          <Link className="wordmark" href="/" aria-label="govroute home">
            <span className="wordmark__mark" aria-hidden="true">G</span>
            govroute
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/guides">Pathways</Link>
            <Link href="/data">Sources & coverage</Link>
            <Link href="/about">About</Link>
          </nav>
          <Link className="header-ask" href="/#ask"><span aria-hidden="true" /> Get guidance</Link>
        </div>
      </header>
  );
}
