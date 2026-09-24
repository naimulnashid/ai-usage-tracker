/**
 * The raster sizes of the installed app's icon: 192 and 512 are the two the
 * browsers ask a manifest for. Shared by the manifest, which lists them, and
 * the route that draws them, which refuses any other size.
 */
export const APP_ICON_SIZES = [192, 512] as const;
