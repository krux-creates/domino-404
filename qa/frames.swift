// Turns the screencast frames qa/demo.mjs saved (media/frames/*.jpg plus their times) into
// media/demo-video.mp4: H.264 at 30 fps, each frame held until the next one arrived.
//   swift qa/frames.swift
import AVFoundation
import AppKit

let dir = URL(fileURLWithPath: "media/frames/")
let list = try JSONSerialization.jsonObject(with: Data(contentsOf: dir.appendingPathComponent("frames.json"))) as! [[String: Any]]
let first = NSImage(contentsOf: dir.appendingPathComponent(list[0]["file"] as! String))!
let rep0 = first.representations[0]
let w = rep0.pixelsWide, h = rep0.pixelsHigh

let out = URL(fileURLWithPath: "media/demo-video.mp4")
try? FileManager.default.removeItem(at: out)
let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: w, AVVideoHeightKey: h,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 12_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: w, kCVPixelBufferHeightKey as String: h,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

func buffer(_ url: URL) -> CVPixelBuffer {
  let img = NSImage(contentsOf: url)!.cgImage(forProposedRect: nil, context: nil, hints: nil)!
  var pb: CVPixelBuffer?
  CVPixelBufferCreate(nil, w, h, kCVPixelFormatType_32ARGB, nil, &pb)
  CVPixelBufferLockBaseAddress(pb!, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb!), width: w, height: h, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb!), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
  CVPixelBufferUnlockBaseAddress(pb!, [])
  return pb!
}

// a constant 30 fps: for each output frame, the latest screencast frame at that moment
let fps = 30.0
let end = list.last!["t"] as! Double
var i = 0, written = 0
var current = buffer(dir.appendingPathComponent(list[0]["file"] as! String)), currentIndex = 0
for n in 0..<Int(end * fps) {
  let t = Double(n) / fps
  while i + 1 < list.count, (list[i + 1]["t"] as! Double) <= t { i += 1 }
  if i != currentIndex { current = buffer(dir.appendingPathComponent(list[i]["file"] as! String)); currentIndex = i }
  while !input.isReadyForMoreMediaData { usleep(2000) }
  adaptor.append(current, withPresentationTime: CMTime(value: CMTimeValue(n), timescale: CMTimeScale(fps)))
  written += 1
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
print("demo-video.mp4:", writer.status == .completed ? "ok" : "failed \(String(describing: writer.error))", "\(w)x\(h), \(written) frames, \(String(format: "%.1f", end)) s")
