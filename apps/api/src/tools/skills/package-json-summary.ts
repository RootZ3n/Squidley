import * as fs from 'fs';
import * as path from 'path';

interface PackageJsonSummary {
  name: string;
  scripts?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
  packageManager?: string;
}

export async function packageJsonSummary(): Promise<PackageJsonSummary> {
  const rootPackageJsonPath = path.join(process.cwd(), 'package.json');

  if (!fs.existsSync(rootPackageJsonPath)) {
    throw new Error('package.json not found at root of repository');
  }

  const packageJsonContent = fs.readFileSync(rootPackageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent);

  const summary: PackageJsonSummary = {
    name: packageJson.name || 'unknown',
  };

  if (packageJson.scripts && Object.keys(packageJson.scripts).length > 0) {
    summary.scripts = packageJson.scripts;
  }

  if (packageJson.workspaces) {
    summary.workspaces = packageJson.workspaces;
  }

  if (packageJson.packageManager) {
    summary.packageManager = packageJson.packageManager;
  }

  return summary;
}
