import { iconUrl } from './files'
// Material Design icon paths (Apache 2.0), 24×24 viewBox.
const PATHS = {
  search:
    'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  forward: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
  up: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
  refresh:
    'M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z'
}

/** Drive's icon for a file type, falling back to a plain built-in icon if it can't load (e.g. offline). */
export function FileIcon({ mimeType, ...props }: { mimeType: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
  const folder = mimeType === 'application/vnd.google-apps.folder'
  return (
    <img
      src={iconUrl(mimeType)}
      alt=""
      draggable={false}
      onError={(e) => {
        const fallback = svgDataUrl(folder ? FALLBACK.folder : FALLBACK.file)
        if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback
      }}
      {...props}
    />
  )
}

const FALLBACK = {
  folder: 'M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  file: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z'
}
const svgDataUrl = (path: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#8a8f98" d="${path}"/></svg>`)}`

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} fill="currentColor" />
    </svg>
  )
}
