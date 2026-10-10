import { MiloMark } from "./milo-mark";

export function SiteFooter({ links }: { links: { href: string; label: string }[] }) {
  return (
    <footer className="footer" data-bg="ink">
      <div className="footer-top">
        <span className="wordmark">milo</span>
        <div className="footer-col">
          <p className="label"><span>1.0</span><span>Start</span></p>
          <ul>{links.map((link) => <li key={link.href}><a href={link.href}>{link.label}</a></li>)}</ul>
        </div>
      </div>
      <div className="footer-bottom">
        <MiloMark />
        <p className="footer-legal"><span>Not a medical device</span><span>AI voices are always labeled</span><span>Never dials for you</span><span lang="el">μιλώ</span></p>
      </div>
    </footer>
  );
}
