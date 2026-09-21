import keycloak from '../keycloak';

export default function Header({ groups = [] }) {
  const username =
    keycloak.tokenParsed?.preferred_username ||
    keycloak.tokenParsed?.name ||
    'User';

  const handleLogout = () => {
    keycloak.logout({ redirectUri: window.location.origin });
  };

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-pam-600">
            PAM Platform
          </p>
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-medium text-slate-900">{username}</span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Groups</p>
            <p className="text-sm text-slate-800">
              {groups.length > 0 ? groups.join(', ') : 'none'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
