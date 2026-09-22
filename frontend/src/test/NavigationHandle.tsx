import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { navigation } from './navigation'

/** Render inside the router under test; it exposes that router's navigate() and current location. */
export function NavigationHandle() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    navigation.to = navigate
    return () => {
      navigation.to = null
    }
  }, [navigate])
  useEffect(() => {
    navigation.location = location
    return () => {
      navigation.location = null
    }
  }, [location])
  return null
}
