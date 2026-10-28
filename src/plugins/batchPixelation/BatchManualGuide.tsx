import type { ManualGuide } from "../../editor/manualGuide.ts"
import { BulletList, OrderedList, SectionCopy, SectionStack } from "../../editor/ManualScreen.tsx"

const externalLinkStyle = { color: "#1254ab", textDecoration: "underline", textUnderlineOffset: 2 }

export const BATCH_MANUAL_GUIDE: ManualGuide = {
    title: "Batch Pixelation — User Guide",
    backLabel: "Back",
    sections: [
        {
            id: "about",
            title: "What is Batch Pixelation",
            navLabel: "About",
            mobileNavLines: ["About", "Plugin"],
            content: <SectionStack>
                <SectionCopy>Batch Pixelation applies one pixel-art recipe to a sequence of still frames. It is designed for video or animation that you have already split into images. Style one reference frame, then process the rest with the same settings.</SectionCopy>
                <SectionCopy>The plugin produces a ZIP of processed PNG frames. It does not split a video into frames, join the frames into a GIF or video, or add audio.</SectionCopy>
                <SectionCopy>Batch processing requires selecting source frames. On iPadOS 17, Safari cannot select a folder, so use <strong>Choose Source Files</strong> to select multiple frames instead. Folder selection is available in Safari on iPadOS 18.4 or later. If neither selection method is available, you can still style a reference frame and save its settings as a Batch Recipe, but you cannot process frames or download a ZIP. The plugin does not offer a standalone image export.</SectionCopy>
            </SectionStack>,
        },
        {
            id: "prepare",
            title: "Prepare Your Frames",
            navLabel: "Prepare Frames",
            mobileNavLines: ["Prepare", "Frames"],
            content: <SectionStack>
                <SectionCopy>Export your source video or animation as individual image files. Keep a copy of the original sequence and note its frame rate so you can recreate the timing later.</SectionCopy>
                <BulletList items={[
                    "Use the same width and height for every frame, including the frame you choose as the reference.",
                    "Keep the frames in one folder and give them sequential, zero-padded names such as frame_0001.png, frame_0002.png, and frame_0003.png.",
                    "Use supported still images: PNG, JPEG, or non-animated GIF. Animated image files cannot be used as individual source frames.",
                    "Remove unrelated files from the source folder before processing.",
                ]} />
            </SectionStack>,
        },
        {
            id: "reference",
            title: "Create a Recipe",
            navLabel: "Create Recipe",
            mobileNavLines: ["Create", "Recipe"],
            content: <SectionStack>
                <OrderedList items={[
                    <>Choose <strong>Set a Frame as Reference</strong> and open one frame from the sequence.</>,
                    "Crop and adjust that frame, then choose the pixel-art settings you want to apply to the whole sequence.",
                    <>To inspect the result at a larger size, select <strong>Fullscreen Preview</strong> in the top toolbar. It shows the current canvas without editing it or changing your settings. On a phone held upright, a wide frame rotates to use more of the screen. Select the close icon to return to the editor.</>,
                    <>Select <strong>Save Batch Recipe</strong> to download a reusable recipe, or <strong>Choose Source Frames</strong> to process frames now. Each action captures the current, finished editor settings independently.</>,
                ]} />
                <SectionCopy>With <strong>Auto Palette</strong>, colors are recalculated for each frame using the selected method and color count. This can preserve changing light colors, but may cause colors to flicker between frames.</SectionCopy>
                <SectionCopy>For a fixed palette matching the current Auto Palette, switch to <strong>Palette Presets</strong> and select <strong>SAME AS AUTO</strong>. Switching tabs captures the current Auto colors; selecting the preset applies that captured palette to the reference and every batch frame. Return to Auto and switch back to refresh the captured colors before selecting the preset again.</SectionCopy>
                <SectionCopy>The reference establishes the recipe and the expected dimensions of the source frames. Keep the downloaded recipe if you plan to process the sequence later or in a new session.</SectionCopy>
            </SectionStack>,
        },
        {
            id: "saved-recipe",
            title: "Open a Saved Recipe",
            navLabel: "Saved Recipe",
            mobileNavLines: ["Saved", "Recipe"],
            content: <SectionStack>
                <SectionCopy>On the plugin start screen, choose <strong>Open Saved Batch Recipe</strong> and select the recipe you downloaded earlier. This takes you straight to the source-frame step, without styling the reference again.</SectionCopy>
                <SectionCopy>A recipe stores the pixel-art settings, not the source frames. You will still need to select the folder or files of frames to process.</SectionCopy>
            </SectionStack>,
        },
        {
            id: "process",
            title: "Process the Sequence",
            navLabel: "Process Frames",
            mobileNavLines: ["Process", "Frames"],
            content: <SectionStack>
                <OrderedList items={[
                    <>Choose <strong>Choose Source Folder</strong> and select the folder containing your frames. On iOS, you can choose <strong>Choose Source Files</strong> to select multiple frames instead.</>,
                    "Check the scan result. Frames with unsupported formats or mismatched dimensions are excluded; the sequence must match the reference frame's original dimensions.",
                    <>Select <strong>Start Batch</strong> and leave the page open while the frames are processed.</>,
                    <>When processing finishes, select <strong>Prepare and Download ZIP</strong>, then confirm the download.</>,
                ]} />
                <SectionCopy>The ZIP contains the processed PNG frames and a <code>batch_report.txt</code> file with the results. Review the report if any frames were excluded or failed.</SectionCopy>
                <SectionCopy>During processing, <strong>Cancel</strong> finishes the current frame, stops before the next one, and keeps completed frames available for <strong>Prepare and Download ZIP</strong>. Once the run has stopped, <strong>Cancel</strong> closes the overlay and clears any temporary results that have not been packaged. If you styled a reference in this session, you return to that editor; if you opened a saved recipe, you return to the plugin start screen. <strong>Start Over</strong> discards the current run and begins a new plugin session.</SectionCopy>
            </SectionStack>,
        },
        {
            id: "assemble",
            title: "Make a GIF or Video",
            navLabel: "GIF & Video",
            mobileNavLines: ["GIF &", "Video"],
            content: <SectionStack>
                <SectionCopy>Extract the processed PNGs and assemble them in a video editor or another image-sequence tool. Keep their filename order and set the playback timing to match the original sequence.</SectionCopy>
                <SectionCopy>For example, <a href="https://ezgif.com/" target="_blank" rel="noopener noreferrer" style={externalLinkStyle} onClick={event => event.stopPropagation()}>Ezgif</a> offers <a href="https://ezgif.com/maker" target="_blank" rel="noopener noreferrer" style={externalLinkStyle} onClick={event => event.stopPropagation()}>GIF Maker</a> for animated GIFs and <a href="https://ezgif.com/images-to-video" target="_blank" rel="noopener noreferrer" style={externalLinkStyle} onClick={event => event.stopPropagation()}>Images to Video</a> for MP4 files. Uploading frames to Ezgif sends them to a third-party service.</SectionCopy>
                <SectionCopy>Batch Pixelation does not assemble the final animation or video. If you need sound, add it in a video-editing tool after assembling the processed frames.</SectionCopy>
            </SectionStack>,
        },
    ],
}
