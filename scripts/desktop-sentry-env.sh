configure_desktop_sentry() {
  local environment="$1"
  local dsn

  case "${environment}" in
    production)
      dsn="${ROUTEVN_SENTRY_PRODUCTION_DSN:-https://4a1f0f2f77f130fd8366487119b90a7d@api1.routevn.com/system/sentry/1}"
      ;;
    development)
      dsn="${ROUTEVN_SENTRY_DEVELOPMENT_DSN:-http://11111111111111111111111111111111@127.0.0.1:3000/system/sentry/1}"
      ;;
    *)
      echo "Invalid desktop error collector environment." >&2
      return 1
      ;;
  esac

  node scripts/validate-desktop-sentry-dsn.js "${environment}" "${dsn}" || return 1

  export VITE_ROUTEVN_SENTRY_ENVIRONMENT="${environment}"
  export VITE_ROUTEVN_SENTRY_DSN="${dsn}"
  export VITE_ROUTEVN_BUILD_ID="$(git rev-parse --short=12 HEAD 2>/dev/null || echo local)"
}
