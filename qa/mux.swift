// Joins the picture and sound qa/demo.mjs records into the launch clip, with macOS's own AVFoundation.
//   swift qa/mux.swift [sound start, s]   → media/demo.mp4 (1080p) and media/demo-720.mp4 (for uploads under 10 MB)
import AVFoundation

let media = URL(fileURLWithPath: "media/")
let video = AVURLAsset(url: media.appendingPathComponent("demo-video.mp4"))
let audio = AVURLAsset(url: media.appendingPathComponent("demo-audio.m4a"))

let comp = AVMutableComposition()
let vTrack = video.tracks(withMediaType: .video)[0]
let span = CMTimeRange(start: .zero, duration: vTrack.timeRange.duration)
let v = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try v.insertTimeRange(span, of: vTrack, at: .zero)
v.preferredTransform = vTrack.preferredTransform
if let aTrack = audio.tracks(withMediaType: .audio).first {
  let a = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
  // The sound track only begins with the first sound (the push), so it is placed by hand: pass
  // the second in the picture where the sound should start, found by lining the thud (the loudest
  // sample) up with the sign landing. Without it, the two are lined up by their ends.
  let aDur = min(aTrack.timeRange.duration, span.duration)
  var at = span.duration - aDur
  if CommandLine.arguments.count > 1 { at = CMTime(seconds: Double(CommandLine.arguments[1])!, preferredTimescale: 600) }
  else if let data = try? Data(contentsOf: media.appendingPathComponent("demo-sync.json")),
          let sync = try? JSONSerialization.jsonObject(with: data) as? [String: Double], let thud = sync["thud"] {
    // the thud is the loudest moment of the sound; put it where the recorder saw it happen
    let reader = try AVAssetReader(asset: audio)
    let pcm = AVAssetReaderTrackOutput(track: aTrack, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false, AVNumberOfChannelsKey: 1, AVSampleRateKey: 48000])
    reader.add(pcm); reader.startReading()
    var n = 0, best = 0, bestAt = 0
    while let buf = pcm.copyNextSampleBuffer(), let block = CMSampleBufferGetDataBuffer(buf) {
      var len = 0; var ptr: UnsafeMutablePointer<Int8>? = nil
      CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &len, dataPointerOut: &ptr)
      ptr!.withMemoryRebound(to: Int16.self, capacity: len / 2) { p in for i in 0..<(len / 2) { let v = abs(Int(p[i])); if v > best { best = v; bestAt = n }; n += 1 } }
    }
    at = CMTime(seconds: max(0, thud - Double(bestAt) / 48000), preferredTimescale: 600)
    print(String(format: "sound placed at %.2f s (thud %.2f s into the sound, %.2f s into the picture)", CMTimeGetSeconds(at), Double(bestAt) / 48000, thud))
  }
  let fit = min(aDur, span.duration - at)
  try a.insertTimeRange(CMTimeRange(start: aTrack.timeRange.start, duration: fit), of: aTrack, at: at)
}

for (preset, name) in [(AVAssetExportPreset1920x1080, "demo.mp4"), (AVAssetExportPreset1280x720, "demo-720.mp4")] {
  let out = media.appendingPathComponent(name)
  try? FileManager.default.removeItem(at: out)
  let export = AVAssetExportSession(asset: comp, presetName: preset)!
  export.outputURL = out
  export.outputFileType = .mp4
  let done = DispatchSemaphore(value: 0)
  export.exportAsynchronously { done.signal() }
  done.wait()
  print(name, export.status == .completed ? "ok" : "failed: \(String(describing: export.error))", String(format: "%.1f s", CMTimeGetSeconds(span.duration)))
}
