// Copyright (c) 2025, AgriTheory and contributors
// For license information, please see license.txt

frappe.ui.form.on('File', {
	refresh: frm => {
		if (!frm.doc.is_folder) {
			// add download button
			frm.add_custom_button(__('Get Sharing Link', 'Share'), () => get_sharing_link(frm, false))
			if (frm.doc.sharing_link) {
				frm.add_custom_button(__('Reset Sharing Link', 'Share'), () => get_sharing_link(frm, true))
			}
		}

		let file_string = frm.doc.file_type || frm.doc.file_name

		file_string = file_string.toLowerCase()
		if (['doc', 'docx'].some(extension => file_string.includes(extension))) {
			frm.trigger('preview_doc_content')
		} else if (['ppt', 'pptx', 'odp', 'key'].some(extension => file_string.includes(extension))) {
			frm.trigger('preview_file_as_pdf')
		}

		// Formatting Buttons for File Versioning
		bindFileVersioningButtons(frm);
	},

	preview_file_as_pdf: async function (frm) {
		const response = await frm.call('get_pdf_preview')
		let pdf_content = response.message
		if (pdf_content) {
			// Always treat as base64 string from backend
			const byteCharacters = atob(pdf_content)
			const byteNumbers = new Array(byteCharacters.length)
			for (let i = 0; i < byteCharacters.length; i++) {
				byteNumbers[i] = byteCharacters.charCodeAt(i)
			}
			const byteArray = new Uint8Array(byteNumbers)
			const blob = new Blob([byteArray], { type: 'application/pdf' })
			const url = URL.createObjectURL(blob)
			const field = frm.get_field('preview_html')
			const $preview = $(`<div class="img_preview">
			   <object style="background:#323639;" width="100%">
				   <embed
					   style="background:#323639;"
					   width="100%"
					   height="1190"
					   src="${url}" type="application/pdf"
				   >
			   </object>
		   </div>`)
			field.$wrapper.html($preview)
			frm.toggle_display('preview', true)
		}
	},

	preview_doc_content: async function (frm) {
		const response = await frm.call('get_content')
		let file_content = response.message
		if (file_content) {
			const field = frm.get_field('preview_html')
			const container = field.wrapper

			frappe.Docx.renderAsync(file_content, container, container, {
				ignoreLastRenderedPageBreak: false,
				experimental: true,
			})

			frm.toggle_display('preview', true)
		}
	},

	preview_file: function (frm) {
		let $preview = ''
		const file_extension = frm.doc.file_type.toLowerCase()
		// Cloud Storage: replace # with %23 in PDFs
		const file_url = frm.doc.file_url.replace(/#/g, '%23')

		if (frappe.utils.is_image_file(file_url)) {
			$preview = $(`<div class="img_preview">
				<img
					class="img-responsive"
					src="${file_url}"
					onerror="${frm.toggle_display('preview', false)}"
				/>
			</div>`)
		} else if (frappe.utils.is_video_file(file_url)) {
			$preview = $(`<div class="img_preview">
				<video width="480" height="320" controls>
					<source src="${file_url}">
					${__('Your browser does not support the video element.')}
				</video>
			</div>`)
		} else if (file_extension === 'pdf') {
			$preview = $(`<div class="img_preview">
				<object style="background:#323639;" width="100%">
					<embed
						style="background:#323639;"
						width="100%"
						height="1190"
						src="${file_url}" type="application/pdf"
					>
				</object>
			</div>`)
		} else if (file_extension === 'mp3') {
			$preview = $(`<div class="img_preview">
				<audio width="480" height="60" controls>
					<source src="${file_url}" type="audio/mpeg">
					${__('Your browser does not support the audio element.')}
				</audio >
			</div>`)
		}

		if ($preview) {
			frm.toggle_display('preview', true)
			frm.get_field('preview_html').$wrapper.html($preview)
		}
	},
})

function get_sharing_link(frm, reset) {
	frappe
		.xcall('cloud_storage.cloud_storage.overrides.file.get_sharing_link', { docname: frm.doc.name, reset: reset })
		.then(r => {
			frappe.msgprint(r, __('Sharing Link'))
		})
}

function bindFileVersioningButtons(frm) {
	// Version Link Button
	cur_frm.fields_dict["versions"].$wrapper.find('.grid-body .rows').find(".grid-row").each(function (i, item) {
		$(item).find('[data-fieldname="get_version_link"]').css({
			"display": "flex",
			"justify-content": "center",
			"align-items": "center",
			"width": "100%",
			"height": "100%",
		})
		$(item).find('[data-fieldname="get_version_link"]').empty().append(`<button class="btn btn-primary btn-xs" style="line-height: 1rem; font-size: 0.8rem; border-radius: 6px; background-color: rgb(108, 122, 86); font-weight: bold;">Get Version Link</button>`).click(function (frm) {

			let cdn = $(item).attr('data-name')
			let cdt = cur_frm.fields_dict["versions"].grid.doctype
			let row = locals[cdt][cdn]
			frappe.call({
				method: 'cloud_storage.api.get_sharing_url',
				args: {
					"version": row.version,
					"key": cur_frm.doc.s3_key,
				},
				callback: function (res) {
					navigator.clipboard.writeText(res.message);
					frappe.show_alert({
						message: __('Version link copied to clipboard'),
						indicator: 'green'
					});
				}
			})
		},)
	});

	// Restore Version Button
	cur_frm.fields_dict["versions"].$wrapper.find('.grid-body .rows').find(".grid-row").each(function (i, item) {
		$(item).find('[data-fieldname="restore_file_version"]').css({
			"display": "flex",
			"justify-content": "center",
			"align-items": "center",
			"width": "100%",
			"height": "100%",
		})

		$(item).find('[data-fieldname="restore_file_version"]').empty().append(`<button class="btn btn-primary btn-xs" style="line-height: 1rem; font-size: 0.8rem; border-radius: 6px; background-color: rgb(108, 122, 86); font-weight: bold;">Restore File Version</button>`).click(function (frm) {
			let cdn = $(item).attr('data-name')
			let cdt = cur_frm.fields_dict["versions"].grid.doctype
			let row = locals[cdt][cdn]
			frappe.call('cloud_storage.api.get_latest_version', { "filename": cur_frm.doc.name }).then(latest_version => {
				console.log(latest_version, row.version)
				if (latest_version.message && row.version == latest_version.message) {
					frappe.throw({ message: __("The selected version is already the latest version."), title: __("Cannot Restore Version") })
					return
				} else {
					frappe.confirm(__(`Are you sure you want to restore the version ${row.version}?`),
						() => {
							frappe.call({
								method: "cloud_storage.api.restore_selected_version",
								args: {
									"key": cur_frm.doc.s3_key,
									"version": row.version,
									"filename": cur_frm.doc.name
								},
								freeze: true,
								freeze_message: __('Restoring version...'),
							})
						},
						() => {
							return
						}
					)
				}
			})
		},)
	});
}


frappe.ui.form.on('File Version', {
	get_version_link: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn]
		frappe.call({
			method: 'cloud_storage.api.get_sharing_url',
			args: {
				"version": row.version,
				"key": frm.doc.s3_key,
			},
			callback: function (res) {
				navigator.clipboard.writeText(res.message);
				frappe.show_alert({
					message: __('Version link copied to clipboard'),
					indicator: 'green'
				});
			}
		})
	},

	restore_file_version: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn]
		frappe.call('cloud_storage.api.get_latest_version', { "filename": frm.doc.name }).then(latest_version => {
			console.log(latest_version, row.version)
			if (latest_version.message && row.version == latest_version.message) {
				frappe.throw({ message: __("The selected version is already the latest version."), title: __("Cannot Restore Version") })
				return
			} else {
				frappe.confirm(__(`Are you sure you want to restore the version ${row.version}?`),
					() => {
						frappe.call({
							method: "cloud_storage.api.restore_selected_version",
							args: {
								"key": frm.doc.s3_key,
								"version": row.version,
								"filename": frm.doc.name
							}
						})
					},
					() => {
						return
					}
				)
			}
		})
	}
})