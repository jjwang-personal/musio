import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let iconset = root.appendingPathComponent("build/icon.iconset")
let tiff = root.appendingPathComponent("build/icon.tiff")
let icns = root.appendingPathComponent("build/icon.icns")

try? FileManager.default.removeItem(at: iconset)
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

let outputs: [(String, CGFloat)] = [
  ("icon_16x16.png", 16),
  ("icon_16x16@2x.png", 32),
  ("icon_32x32.png", 32),
  ("icon_32x32@2x.png", 64),
  ("icon_128x128.png", 128),
  ("icon_128x128@2x.png", 256),
  ("icon_256x256.png", 256),
  ("icon_256x256@2x.png", 512),
  ("icon_512x512.png", 512),
  ("icon_512x512@2x.png", 1024)
]

func drawIcon(size: CGFloat) -> NSImage {
  let image = NSImage(size: NSSize(width: size, height: size))
  image.lockFocus()

  let rect = NSRect(x: 0, y: 0, width: size, height: size)
  NSColor(red: 0.03, green: 0.035, blue: 0.06, alpha: 1).setFill()
  NSBezierPath(roundedRect: rect, xRadius: size * 0.22, yRadius: size * 0.22).fill()

  let glow = NSGradient(colors: [
    NSColor(red: 0.41, green: 0.82, blue: 1.0, alpha: 0.85),
    NSColor(red: 0.96, green: 0.72, blue: 0.38, alpha: 0.9),
    NSColor(red: 1.0, green: 0.49, blue: 0.33, alpha: 0.95)
  ])!

  let ringRect = rect.insetBy(dx: size * 0.19, dy: size * 0.19)
  let ringPath = NSBezierPath(ovalIn: ringRect)
  ringPath.lineWidth = max(3, size * 0.045)
  glow.draw(in: ringPath, angle: 35)

  let pulse = NSBezierPath()
  pulse.move(to: NSPoint(x: size * 0.22, y: size * 0.40))
  pulse.line(to: NSPoint(x: size * 0.34, y: size * 0.40))
  pulse.line(to: NSPoint(x: size * 0.42, y: size * 0.66))
  pulse.line(to: NSPoint(x: size * 0.54, y: size * 0.28))
  pulse.line(to: NSPoint(x: size * 0.63, y: size * 0.50))
  pulse.line(to: NSPoint(x: size * 0.78, y: size * 0.50))
  pulse.lineWidth = max(5, size * 0.055)
  pulse.lineCapStyle = .round
  pulse.lineJoinStyle = .round
  NSColor(red: 0.96, green: 0.94, blue: 0.9, alpha: 1).setStroke()
  pulse.stroke()

  let center = NSBezierPath(ovalIn: rect.insetBy(dx: size * 0.43, dy: size * 0.43))
  NSColor(red: 0.96, green: 0.94, blue: 0.9, alpha: 1).setFill()
  center.fill()

  image.unlockFocus()
  return image
}

for (name, size) in outputs {
  let image = drawIcon(size: size)
  guard
    let tiff = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let png = bitmap.representation(using: .png, properties: [:])
  else {
    throw NSError(domain: "MusioIcon", code: 1)
  }

  try png.write(to: iconset.appendingPathComponent(name))
}

let largeImage = drawIcon(size: 1024)
guard
  let largeTiff = largeImage.tiffRepresentation
else {
  throw NSError(domain: "MusioIcon", code: 2)
}

try largeTiff.write(to: tiff)

let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/tiff2icns")
process.arguments = [tiff.path, icns.path]
try process.run()
process.waitUntilExit()

print("Generated \(icns.path)")
