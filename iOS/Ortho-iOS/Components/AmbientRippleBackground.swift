import SwiftUI

/// Ambient background effect: concentric stroke rings expanding from a
/// single origin and fading as they grow. Decorative only — tap-through,
/// hidden from VoiceOver.
///
/// Implemented with `TimelineView(.animation)` + `Canvas` so the per-frame
/// math runs once and renders all rings in a single GPU-friendly pass.
struct AmbientRippleBackground: View {
    /// Respect the system "Reduce Motion" setting (Constitution V): when on,
    /// we render a single static frame of rings instead of the per-frame
    /// `TimelineView(.animation)` loop, so there's no continuous motion.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Where ripples emanate from, as a fraction of the view's size.
    var origin: UnitPoint = UnitPoint(x: 0.5, y: 0.4)
    /// Absolute point-space nudge applied on top of `origin`. Useful when
    /// the visual target is a known offset from a layout anchor (e.g.
    /// "the first letter of the centered wordmark," which is a fixed
    /// number of points left of the wordmark's center regardless of
    /// screen width).
    var originOffset: CGSize = .zero
    /// Stroke color of the rings. View applies its own opacity ramp.
    var rippleColor: Color = .black

    // MARK: - Tuning constants

    /// Number of concurrent rings on screen.
    private let count: Int = 4
    /// Seconds for one ring to grow from origin to the view's far corner.
    private let period: Double = 7.5
    /// Peak ring-stroke opacity, fades to zero as the ring expands.
    private let peakOpacity: Double = 0.18
    /// Stroke width of each ring in points.
    private let lineWidth: CGFloat = 1.25

    var body: some View {
        Group {
            if reduceMotion {
                // Static single frame — no animation loop. The decorative
                // rings are still present (calm, no motion).
                Canvas { canvas, size in
                    drawRings(in: &canvas, size: size, elapsed: 0)
                }
            } else {
                TimelineView(.animation) { context in
                    Canvas { canvas, size in
                        drawRings(in: &canvas, size: size,
                                  elapsed: context.date.timeIntervalSinceReferenceDate)
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// Render the concentric rings for a given `elapsed` time. Pulled out so
    /// the animated and reduce-motion (static) paths share identical drawing.
    private func drawRings(in canvas: inout GraphicsContext,
                           size: CGSize,
                           elapsed: TimeInterval) {
        let center = CGPoint(
            x: size.width * origin.x + originOffset.width,
            y: size.height * origin.y + originOffset.height
        )
        let maxRadius = hypot(
            max(center.x, size.width - center.x),
            max(center.y, size.height - center.y)
        )

        for i in 0..<count {
            let phaseOffset = Double(i) / Double(count)
            let phase = ((elapsed / period) + phaseOffset)
                .truncatingRemainder(dividingBy: 1.0)
            let radius = maxRadius * phase
            let opacity = peakOpacity * (1.0 - phase)
            let rect = CGRect(
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2
            )
            canvas.stroke(
                Path(ellipseIn: rect),
                with: .color(rippleColor.opacity(opacity)),
                lineWidth: lineWidth
            )
        }
    }
}

#Preview("Ripple · Light") {
    ZStack {
        AppTheme.bg.ignoresSafeArea()
        AmbientRippleBackground(rippleColor: AppTheme.accent)
            .ignoresSafeArea()
        Text("ORTHO")
            .font(.lato(size: 28, weight: .regular))
            .tracking(8)
            .foregroundStyle(AppTheme.text)
    }
}

#Preview("Ripple · Dark") {
    ZStack {
        AppTheme.bg.ignoresSafeArea()
        AmbientRippleBackground(rippleColor: AppTheme.accent)
            .ignoresSafeArea()
        Text("ORTHO")
            .font(.lato(size: 28, weight: .regular))
            .tracking(8)
            .foregroundStyle(AppTheme.text)
    }
    .preferredColorScheme(.dark)
}
