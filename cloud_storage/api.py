import frappe
from frappe import _
from cloud_storage.cloud_storage.overrides.file  import get_cloud_storage_client

@frappe.whitelist()
def restore_selected_version(key, version, filename):
    if version:
        file_content, content_type = get_file_from_s3_bucket(key, version)
        if file_content:
            version_id = put_file_into_s3_bucket(key, file_content, content_type)
            if version_id:
               doc = frappe.get_doc("File", filename)
               if doc:
                   doc.append("versions", {
                       "version": version_id,
                       "user": frappe.session.user,
                       "timestamp": frappe.utils.now()
                   }) 
                   doc.save(ignore_permissions=True)
                   frappe.msgprint("Successfully Restored to Version {0}".format(version), alert=True, indicator="green")

def get_file_from_s3_bucket(key, version):
    client = get_cloud_storage_client()
    try:
        # Get the object from S3
        response = client.get_object(
            Bucket=client.bucket,
            Key=key,
            VersionId=version
        )
        file_content = response['Body'].read()
        content_type = response['ContentType']
        return file_content, content_type
    except Exception as e:
        log = frappe.log_error(
            message=str(e),
            title="S3 Get Object Error"
        )
        frappe.msgprint(
            msg="For more details please check the Error Log {0}".format(frappe.utils.get_link_to_form("Error Log", log.name)),
            title=_("Error in Getting S3 Object for Selected Version"),
            indicator="red",
        )

def put_file_into_s3_bucket(key, file_content, content_type):
    client = get_cloud_storage_client()
    try:
        response = client.put_object(
			Body=file_content, 
            Bucket=client.bucket, 
            Key=key, 
            ContentType=content_type
		)
        version_id = response.get("VersionId") or ''
        return version_id
    except Exception as e:
        frappe.msgprint(f"{e}")

@frappe.whitelist()
def get_sharing_url(version, key):
    client = get_cloud_storage_client()
    if version:
        return client.generate_presigned_url(
            ClientMethod="get_object", Params={"Bucket": client.bucket, "Key": key, "VersionId":version}
        )

@frappe.whitelist()
def get_latest_version(filename):
    recent_version = None
    if filename:
        doc = frappe.get_doc("File", filename)
        if doc:
            if len(doc.versions) > 0:
                current_timestamp = doc.versions[0].timestamp
                recent_version = doc.versions[0].version
                for version in doc.versions:
                    if version.timestamp != current_timestamp and version.timestamp > current_timestamp:
                        current_timestamp = version.timestamp
                        recent_version = version.version
    return recent_version