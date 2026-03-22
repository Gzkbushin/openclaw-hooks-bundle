import { queryAuditEvents, type AuditEventAction, type AuditEventType } from "../hooks/audit-logger.ts";

type CliOptions = {
  action?: AuditEventAction;
  limit?: number;
  logDir: string;
  since?: string;
  type?: AuditEventType;
};

const DEFAULT_LOG_DIR = "~/.openclaw/logs/openclaw-quality-hooks";

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { logDir: DEFAULT_LOG_DIR };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const nextValue = argv[index + 1];

    if (value === "--log-dir" && nextValue) {
      options.logDir = nextValue;
      index += 1;
      continue;
    }

    if (value === "--type" && nextValue) {
      options.type = nextValue as AuditEventType;
      index += 1;
      continue;
    }

    if (value === "--action" && nextValue) {
      options.action = nextValue as AuditEventAction;
      index += 1;
      continue;
    }

    if (value === "--since" && nextValue) {
      options.since = nextValue;
      index += 1;
      continue;
    }

    if (value === "--limit" && nextValue) {
      const limit = Number.parseInt(nextValue, 10);
      if (Number.isFinite(limit) && limit > 0) {
        options.limit = limit;
      }
      index += 1;
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));
const results = queryAuditEvents(options.logDir, {
  type: options.type,
  action: options.action,
  since: options.since,
  limit: options.limit
});

if (results.length === 0) {
  console.log("No audit events matched the query.");
  process.exit(0);
}

results.forEach(event => {
  console.log(JSON.stringify(event));
});
