/**
 * Ambient types for the optional private package `@mlightcad/dwg-converter`.
 *
 * The package is an `optionalDependency` (GitHub Packages tarball): installs
 * without registry access skip it entirely, so these declarations keep
 * `tsc` / `next build` green in that case. When the real package is installed,
 * TypeScript resolves its own `types/index.d.ts` and ignores this block.
 */
declare module '@mlightcad/dwg-converter' {
  import {
    AcDbDatabaseConverter,
    type AcDbDatabaseConverterConfig
  } from '@mlightcad/data-model'

  export interface AcDbDwgConverterConfig extends AcDbDatabaseConverterConfig {
    /** Signed offline license key. Omit to use the 30-day evaluation period. */
    licenseKey?: string
  }

  export type LicenseStatus = 'licensed' | 'trial' | 'expired' | 'invalid'

  export class AcDbDwgConverter extends AcDbDatabaseConverter {
    constructor(config?: AcDbDwgConverterConfig)
  }

  export function getLicenseStatus(licenseKey?: string): Promise<LicenseStatus>

  export function getTrialDaysRemaining(
    licenseKey?: string
  ): Promise<number | null>
}
