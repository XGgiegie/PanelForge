import type { Router } from 'vue-router'

type OpenCharacterWorkspaceWindowInput = {
  scriptId: string
  title: string
}

export function openCharacterWorkspaceWindow(router: Router, input: OpenCharacterWorkspaceWindowInput) {
  const characterRoute = router.resolve({
    name: 'script-outline',
    params: { scriptId: input.scriptId },
  })
  const routeHash = characterRoute.href.startsWith('#') ? characterRoute.href : `#${characterRoute.href}`

  if (window.panelForge?.windows?.openCharacterWorkspaceWindow) {
    void window.panelForge.windows.openCharacterWorkspaceWindow({
      routeHash,
      title: input.title,
    }).catch(() => {
      void router.push({ name: 'script-outline', params: { scriptId: input.scriptId } })
    })
    return
  }

  const popup = window.open(
    routeHash,
    `character-workspace-${input.scriptId}`,
    'popup=yes,width=1320,height=880,resizable=yes,scrollbars=yes',
  )

  if (!popup) {
    void router.push({ name: 'script-outline', params: { scriptId: input.scriptId } })
  }
}
