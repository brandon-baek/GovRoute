import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div>
          <strong>govroute</strong>
          <p>Clear routes through public services.</p>
        </div>
        <div className="footer-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/data">Source policy</Link>
          <a href="https://www.usa.gov/" target="_blank" rel="noreferrer">USA.gov</a>
        </div>
      </div>
    </footer>
  );
}
