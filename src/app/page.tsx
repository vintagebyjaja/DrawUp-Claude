export default function Home() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <h1
        className="text-3xl font-extrabold"
        style={{ fontFamily: "var(--font-display)" }}
      >
        DrawUp Studio
      </h1>
      <p className="max-w-md" style={{ color: "var(--ink-soft)" }}>
        This is the real DrawUp product app — separate from the drawup.studio
        marketing site. The validated design (Home, Discover, Arch Coach,
        Check, Details, Resources, Swap, Connect, Firm Profile, Pricing, For
        Firms) lives in the Season 1 preview artifact; this scaffold's
        globals.css already carries the same DrawUp Lab / DrawUp Gallery
        tokens, so routes you build here start from the real palette.
      </p>
    </main>
  );
}
