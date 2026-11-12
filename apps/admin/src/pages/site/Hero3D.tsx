import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// WIT palette, as the 3D scene needs plain numbers rather than CSS tokens.
const RED = 0xed1c24
const INK = 0x101112
const BLUE = 0x83b3ee
const PEARL = 0xf4f1ee

const TILES = 16

/**
 * The hero object: a chrome sphere held by two rings, a ring of glossy tiles turning around it and a
 * coin floating above. It pauses off screen and in a hidden tab, and stands still for people who ask
 * for less motion.
 */
export function Hero3D({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      })
    } catch {
      setFailed(true)
      return
    }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // setSize below leaves CSS alone, so the canvas follows its box instead of its pixel count.
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' })
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    scene.environment = pmrem.fromScene(room, 0.04).texture

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
    camera.position.set(0, 3.2, 11)

    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(4, 8, 5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.radius = 8
    scene.add(key, new THREE.AmbientLight(0xffffff, 0.35))

    const stage = new THREE.Group()
    stage.rotation.x = 0.32
    scene.add(stage)

    const chrome = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08 })
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.15, 96, 96), chrome)
    sphere.castShadow = true
    stage.add(sphere)

    const redRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.07, 32, 160),
      new THREE.MeshPhysicalMaterial({
        color: RED,
        metalness: 0.3,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
      }),
    )
    redRing.rotation.set(Math.PI / 2.4, 0.3, 0)
    const chromeRing = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.035, 24, 160), chrome)
    chromeRing.rotation.set(Math.PI / 1.7, -0.5, 0)
    stage.add(redRing, chromeRing)

    const glossy = (color: number, metal = 0.1) =>
      new THREE.MeshPhysicalMaterial({
        color,
        metalness: metal,
        roughness: 0.15,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
      })
    const tileMaterials = [glossy(RED), glossy(INK, 0.2), glossy(BLUE), glossy(PEARL), glossy(RED), chrome]
    const tileGeometry = new RoundedBoxGeometry(0.62, 0.36, 0.18, 4, 0.08)
    const orbit = new THREE.Group()
    for (let i = 0; i < TILES; i++) {
      const angle = (i / TILES) * Math.PI * 2
      const tile = new THREE.Mesh(tileGeometry, tileMaterials[i % tileMaterials.length])
      // Leave gaps in the ring, as the pieces look loose rather than chained.
      if (i % 5 === 4) continue
      tile.position.set(Math.cos(angle) * 2.75, Math.sin(angle * 2) * 0.18, Math.sin(angle) * 2.75)
      tile.rotation.set(0.2 * Math.sin(angle * 3), -angle + Math.PI / 2, 0.15 * Math.cos(angle))
      tile.castShadow = true
      orbit.add(tile)
    }
    stage.add(orbit)

    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.09, 64),
      new THREE.MeshPhysicalMaterial({ color: RED, metalness: 0.6, roughness: 0.2, clearcoat: 1 }),
    )
    coin.position.set(1.9, 2.1, -0.4)
    coin.rotation.set(Math.PI / 2.6, 0, 0.3)
    coin.castShadow = true
    stage.add(coin)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.12 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -1.9
    ground.receiveShadow = true
    stage.add(ground)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      // Pull back on narrow screens so the ring stays whole.
      camera.position.z = w / h < 1 ? 15 : 11
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(el)

    const pointer = { x: 0, y: 0 }
    const onPointer = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onPointer, { passive: true })

    let visible = true
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    seen.observe(el)

    const clock = new THREE.Clock()
    let frame = 0
    const draw = () => {
      const t = clock.getElapsedTime()
      orbit.rotation.y = t * 0.18
      redRing.rotation.z = t * 0.35
      chromeRing.rotation.z = -t * 0.25
      coin.rotation.z = 0.3 + t * 0.9
      coin.position.y = 2.1 + Math.sin(t * 1.2) * 0.15
      camera.position.x += (pointer.x * 0.9 - camera.position.x) * 0.04
      camera.position.y += (3.2 - pointer.y * 0.6 - camera.position.y) * 0.04
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
    }
    const loop = () => {
      frame = requestAnimationFrame(loop)
      if (visible && !document.hidden) draw()
    }
    if (still) draw()
    else loop()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      seen.disconnect()
      window.removeEventListener('pointermove', onPointer)
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          const m = o.material as THREE.Material | THREE.Material[]
          for (const mat of Array.isArray(m) ? m : [m]) mat.dispose()
        }
      })
      scene.environment?.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  if (failed) {
    return (
      <div
        className={className}
        aria-hidden
        style={{ background: 'radial-gradient(circle at 60% 45%, #fff 0, #fdeced 35%, transparent 70%)' }}
      />
    )
  }
  return <div ref={host} className={className} aria-hidden />
}
