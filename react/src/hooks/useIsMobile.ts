import { useEffect, useState } from 'react'

const BREAKPOINT = 760

function getIsMobile() {
  return typeof window !== 'undefined' && window.innerWidth <= BREAKPOINT
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(getIsMobile)

  useEffect(() => {
    const onResize = () => setIsMobile(getIsMobile())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return isMobile
}
